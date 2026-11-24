import React, { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Heading1,
  RotateCcw,
  Terminal,
  Type,
} from "lucide-react";
import {
  APP_FONT_OPTIONS,
  DEFAULT_FONT_BODY,
  DEFAULT_FONT_DISPLAY,
  DEFAULT_FONT_MONO,
  DEFAULT_FONT_NOTES,
  DISPLAY_FONT_OPTIONS,
  FONT_PAIRING_PRESETS,
  FontOption,
  MONO_FONT_OPTIONS,
  NOTES_FONT_OPTIONS,
  resolveWorkspaceFontStacks,
} from "../../lib/fonts";
import { WorkspaceSettings } from "../../types";

interface TypographySettingsPanelProps {
  settings: WorkspaceSettings;
  onUpdateSettings: (patch: Partial<WorkspaceSettings>) => void;
}

type SubSectionKey = "display" | "notes" | "mono";

function FontOptionGrid<TId extends string>({
  options,
  activeId,
  inheritedStack,
  onSelect,
}: {
  options: FontOption<TId>[];
  activeId: TId;
  inheritedStack?: string;
  onSelect: (id: TId) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => {
        const active = activeId === opt.id;
        const previewFamily =
          opt.cssStack === "inherit" && inheritedStack
            ? inheritedStack
            : opt.cssStack;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className="flex items-start justify-between gap-2.5 p-2.5 rounded-xl border text-left transition-colors"
            style={{
              backgroundColor: active
                ? "var(--accent-soft)"
                : "var(--bg-surface)",
              borderColor: active ? "var(--accent)" : "var(--border-subtle)",
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className="text-[13px] font-semibold leading-tight"
                  style={{
                    fontFamily: previewFamily,
                    color: "var(--text-primary)",
                  }}
                >
                  {opt.label}
                </span>
                {opt.badge && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-medium leading-none"
                    style={{
                      backgroundColor: "var(--bg-surface-subtle)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {opt.badge}
                  </span>
                )}
              </div>
              <div
                className="text-[10.5px] mt-0.5 line-clamp-1"
                style={{ color: "var(--text-muted)" }}
              >
                {opt.category} · {opt.description}
              </div>
              <div
                className="text-[11.5px] mt-1.5 truncate"
                style={{
                  fontFamily: previewFamily,
                  color: "var(--text-secondary)",
                }}
              >
                {opt.sample}
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
              <span
                className="text-[11px] font-semibold px-1.5 py-0.5 rounded border"
                style={{
                  fontFamily: previewFamily,
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                Aa
              </span>
              {active && (
                <Check
                  className="w-3.5 h-3.5"
                  style={{ color: "var(--accent)" }}
                />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export const TypographySettingsPanel: React.FC<
  TypographySettingsPanelProps
> = ({ settings, onUpdateSettings }) => {
  const [openSection, setOpenSection] = useState<SubSectionKey | null>(
    "display",
  );

  const resolved = useMemo(
    () => resolveWorkspaceFontStacks(settings),
    [settings],
  );

  const isDefaultTypography =
    resolved.fontBody === DEFAULT_FONT_BODY &&
    resolved.fontDisplay === DEFAULT_FONT_DISPLAY &&
    resolved.fontNotes === DEFAULT_FONT_NOTES &&
    resolved.fontMono === DEFAULT_FONT_MONO;

  const handleReset = () => {
    onUpdateSettings({
      fontBody: DEFAULT_FONT_BODY,
      fontDisplay: DEFAULT_FONT_DISPLAY,
      fontNotes: DEFAULT_FONT_NOTES,
      fontMono: DEFAULT_FONT_MONO,
    });
  };

  const toggleSection = (key: SubSectionKey) => {
    setOpenSection((prev) => (prev === key ? null : key));
  };

  return (
    <div
      className="space-y-4 pt-4 border-t"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Type className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <div className="text-sm font-semibold">Typography & Fonts</div>
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Switch the primary font across the app, or tailor headings, notes,
            and monospace numbers separately.
          </div>
        </div>
        {!isDefaultTypography && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium shrink-0 transition-colors hover:bg-[var(--bg-surface-subtle)]"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Live Specimen Card */}
      <div
        className="rounded-xl border p-3.5 space-y-2"
        style={{
          backgroundColor: "var(--bg-surface-subtle)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Live Specimen
          </span>
          <span
            className="text-[11px] tabular-nums"
            style={{
              fontFamily: resolved.monoStack,
              color: "var(--accent)",
            }}
          >
            08:30 AM · 14/20 · $1,240.50
          </span>
        </div>
        <div
          className="text-base font-bold leading-snug"
          style={{
            fontFamily: resolved.displayStack,
            color: "var(--text-primary)",
          }}
        >
          Morning Review & Quiet Reading
        </div>
        <div
          className="text-xs leading-relaxed"
          style={{
            fontFamily: resolved.bodyStack,
            color: "var(--text-secondary)",
          }}
        >
          App UI text across Focus, Timeline, Lists, Contacts, and Finance
          renders in {resolved.bodyOption.label}.
        </div>
        <div
          className="text-xs italic pt-1 border-t"
          style={{
            fontFamily: resolved.notesStack,
            borderColor: "var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
        >
          “Notes & Journal canvas: write clearly without visual friction.”
        </div>
      </div>

      {/* Recommended Pairings */}
      <div className="space-y-2">
        <div
          className="text-xs font-semibold"
          style={{ color: "var(--text-secondary)" }}
        >
          Recommended Pairings
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FONT_PAIRING_PRESETS.map((preset) => {
            const active =
              resolved.fontBody === preset.fontBody &&
              resolved.fontDisplay === preset.fontDisplay &&
              resolved.fontNotes === preset.fontNotes &&
              resolved.fontMono === preset.fontMono;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    fontBody: preset.fontBody,
                    fontDisplay: preset.fontDisplay,
                    fontNotes: preset.fontNotes,
                    fontMono: preset.fontMono,
                  })
                }
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-colors"
                style={{
                  backgroundColor: active
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                  borderColor: active
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold">{preset.name}</span>
                    {active && (
                      <Check
                        className="w-3 h-3 shrink-0"
                        style={{ color: "var(--accent)" }}
                      />
                    )}
                  </div>
                  <div
                    className="text-[10.5px] truncate mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {preset.tagline}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary App Font */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div
            className="text-xs font-semibold"
            style={{ color: "var(--text-secondary)" }}
          >
            App Interface Font (Entire Workspace)
          </div>
          <span
            className="text-[11px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            {resolved.bodyOption.label}
          </span>
        </div>
        <FontOptionGrid
          options={APP_FONT_OPTIONS}
          activeId={resolved.fontBody}
          onSelect={(fontBody) => onUpdateSettings({ fontBody })}
        />
      </div>

      {/* Dedicated Sub-Settings for Specialized Parts */}
      <div className="space-y-2">
        <div>
          <div
            className="text-xs font-semibold"
            style={{ color: "var(--text-secondary)" }}
          >
            Part-Specific Typography Overrides
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Customize areas of Kanso that use distinct font families
            independently from the main UI font.
          </div>
        </div>

        {/* 1. Headings & Display */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <button
            type="button"
            onClick={() => toggleSection("display")}
            className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--bg-surface-subtle)]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Heading1
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--accent)" }}
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold">Headings & Titles</div>
                <div
                  className="text-[10.5px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  View headers, section headings (H1–H3), and note titles
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-medium border"
                style={{
                  fontFamily: resolved.displayStack,
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              >
                {resolved.displayOption.label}
              </span>
              {openSection === "display" ? (
                <ChevronDown
                  className="w-4 h-4"
                  style={{ color: "var(--text-muted)" }}
                />
              ) : (
                <ChevronRight
                  className="w-4 h-4"
                  style={{ color: "var(--text-muted)" }}
                />
              )}
            </div>
          </button>
          {openSection === "display" && (
            <div
              className="p-3 border-t"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface-subtle)",
              }}
            >
              <FontOptionGrid
                options={DISPLAY_FONT_OPTIONS}
                activeId={resolved.fontDisplay}
                inheritedStack={resolved.bodyStack}
                onSelect={(fontDisplay) => onUpdateSettings({ fontDisplay })}
              />
            </div>
          )}
        </div>

        {/* 2. Notes & Writing Canvas */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <button
            type="button"
            onClick={() => toggleSection("notes")}
            className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--bg-surface-subtle)]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <FileText
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--accent)" }}
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold">
                  Notes & Journal Canvas
                </div>
                <div
                  className="text-[10.5px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  Long-form body font inside the rich Notes editor
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-medium border"
                style={{
                  fontFamily: resolved.notesStack,
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              >
                {resolved.notesOption.label}
              </span>
              {openSection === "notes" ? (
                <ChevronDown
                  className="w-4 h-4"
                  style={{ color: "var(--text-muted)" }}
                />
              ) : (
                <ChevronRight
                  className="w-4 h-4"
                  style={{ color: "var(--text-muted)" }}
                />
              )}
            </div>
          </button>
          {openSection === "notes" && (
            <div
              className="p-3 border-t"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface-subtle)",
              }}
            >
              <FontOptionGrid
                options={NOTES_FONT_OPTIONS}
                activeId={resolved.fontNotes}
                inheritedStack={resolved.bodyStack}
                onSelect={(fontNotes) => onUpdateSettings({ fontNotes })}
              />
            </div>
          )}
        </div>

        {/* 3. Monospace, Timestamps & Numerals */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <button
            type="button"
            onClick={() => toggleSection("mono")}
            className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--bg-surface-subtle)]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Terminal
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--accent)" }}
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold">
                  Code, Timestamps & Numerals
                </div>
                <div
                  className="text-[10.5px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  Timeline clocks, finance numbers, counters, and code blocks
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-medium border tabular-nums"
                style={{
                  fontFamily: resolved.monoStack,
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              >
                {resolved.monoOption.label}
              </span>
              {openSection === "mono" ? (
                <ChevronDown
                  className="w-4 h-4"
                  style={{ color: "var(--text-muted)" }}
                />
              ) : (
                <ChevronRight
                  className="w-4 h-4"
                  style={{ color: "var(--text-muted)" }}
                />
              )}
            </div>
          </button>
          {openSection === "mono" && (
            <div
              className="p-3 border-t"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--bg-surface-subtle)",
              }}
            >
              <FontOptionGrid
                options={MONO_FONT_OPTIONS}
                activeId={resolved.fontMono}
                onSelect={(fontMono) => onUpdateSettings({ fontMono })}
              />
            </div>
          )}
        </div>
      </div>

      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Note: Inside Library Reader Studio, EPUB/book prose continues using your
        per-book typography setting from the reader toolbar, while code snippets
        follow your monospace font above.
      </div>
    </div>
  );
};
