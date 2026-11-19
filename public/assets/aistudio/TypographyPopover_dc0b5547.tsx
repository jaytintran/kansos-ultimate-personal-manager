import {
  AlignJustify,
  AlignLeft,
  BookOpen,
  Columns2,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  ScrollText,
  Sun,
} from 'lucide-react';
import React from 'react';
import type {BookFormat, ReaderPreferences} from '../../types/library';

interface TypographyPopoverProps {
  format: BookFormat;
  prefs: ReaderPreferences;
  embeddedInSheet?: boolean;
  onUpdate: (patch: Partial<ReaderPreferences>) => void;
  onReset: () => void;
}

export const TypographyPopover: React.FC<TypographyPopoverProps> = ({
  format,
  prefs,
  embeddedInSheet = false,
  onUpdate,
  onReset,
}) => {
  const isPdf = format === 'pdf';

  return (
    <div
      role={embeddedInSheet ? undefined : 'dialog'}
      aria-label={embeddedInSheet ? undefined : 'Reader appearance settings'}
      className={
        embeddedInSheet
          ? 'w-full p-4 space-y-5'
          : 'w-[340px] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl p-5 space-y-5'
      }
    >
      {/* Theme Toggle */}
      <div>
        <div className="text-[11px] font-medium text-[var(--text-muted)] mb-2">Reading Theme</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onUpdate({theme: 'sepia'})}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
              prefs.theme === 'sepia'
                ? 'border-[#9A4D1E] ring-1 ring-[#9A4D1E] bg-[#F4EFE6] text-[#2B2118]'
                : 'border-[var(--border-subtle)] bg-[#F4EFE6] text-[#2B2118] opacity-80 hover:opacity-100'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-[#9A4D1E]" />
            <span>Sepia</span>
          </button>

          <button
            type="button"
            onClick={() => onUpdate({theme: 'dark'})}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
              prefs.theme === 'dark'
                ? 'border-[#D98A4E] ring-1 ring-[#D98A4E] bg-[#121110] text-[#EAE4DC]'
                : 'border-[var(--border-subtle)] bg-[#121110] text-[#EAE4DC] opacity-80 hover:opacity-100'
            }`}
          >
            <Moon className="w-3.5 h-3.5 text-[#D98A4E]" />
            <span>Dark</span>
          </button>
        </div>
      </div>

      {isPdf ? (
        <>
          {/* PDF Scroll Mode */}
          <div>
            <div className="text-[11px] font-medium text-[var(--text-muted)] mb-2">Page Flow</div>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-md bg-[var(--bg-sidebar)]">
              <button
                type="button"
                onClick={() => onUpdate({pdfLayout: 'continuous'})}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  prefs.pdfLayout === 'continuous'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span>Continuous</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdate({pdfLayout: 'single'})}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  prefs.pdfLayout === 'single'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Single Page</span>
              </button>
            </div>
          </div>

          {/* PDF Fit / Zoom */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">Page Scaling</span>
              <span className="font-mono-tabular text-xs text-[var(--text-primary)]">
                {prefs.pdfFitMode === 'width' ? 'Fit Width' : `${Math.round(prefs.pdfZoom * 100)}%`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-md bg-[var(--bg-sidebar)] mb-3">
              <button
                type="button"
                onClick={() => onUpdate({pdfFitMode: 'width'})}
                className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  prefs.pdfFitMode === 'width'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Fit Width
              </button>
              <button
                type="button"
                onClick={() => onUpdate({pdfFitMode: 'manual'})}
                className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  prefs.pdfFitMode === 'manual'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
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
                    pdfFitMode: 'manual',
                    pdfZoom: Math.max(0.6, Number((prefs.pdfZoom - 0.15).toFixed(2))),
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
                  onUpdate({pdfFitMode: 'manual', pdfZoom: parseFloat(e.target.value)})
                }
                aria-label="PDF zoom level"
                className="flex-1 accent-[var(--accent)] cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    pdfFitMode: 'manual',
                    pdfZoom: Math.min(2.2, Number((prefs.pdfZoom + 0.15).toFixed(2))),
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
                Tint bright PDF pages to match {prefs.theme === 'dark' ? 'Dark' : 'Sepia'} mode
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.pdfThemeTone}
              onChange={(e) => onUpdate({pdfThemeTone: e.target.checked})}
              className="mt-0.5 w-4 h-4 accent-[var(--accent)] cursor-pointer"
            />
          </label>
        </>
      ) : (
        <>
          {/* Reading Layout: Continuous vs Single Page vs Two-Page Spread */}
          <div>
            <div className="text-[11px] font-medium text-[var(--text-muted)] mb-2">Page Layout</div>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-[var(--bg-sidebar)]">
              <button
                type="button"
                onClick={() => onUpdate({readingLayout: 'scroll'})}
                className={`inline-flex items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  prefs.readingLayout === 'scroll'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5 shrink-0" />
                <span>Continuous</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdate({readingLayout: 'page'})}
                className={`inline-flex items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  prefs.readingLayout === 'page'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Single Page</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdate({readingLayout: 'spread'})}
                className={`inline-flex items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  prefs.readingLayout === 'spread'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5 shrink-0" />
                <span>Spread</span>
              </button>
            </div>
          </div>

          {/* Font Family & Alignment */}
          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-3">
              <div className="text-[11px] font-medium text-[var(--text-muted)] mb-2">Typeface</div>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-[var(--bg-sidebar)]">
                {(
                  [
                    {id: 'serif', label: 'Serif', cls: 'font-serif-editorial'},
                    {id: 'sans', label: 'Sans', cls: 'font-sans-ui'},
                    {id: 'mono', label: 'Mono', cls: 'font-mono-tabular'},
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onUpdate({fontFamily: f.id})}
                    className={`py-1.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${f.cls} ${
                      prefs.fontFamily === f.id
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-2">
              <div className="text-[11px] font-medium text-[var(--text-muted)] mb-2">Align</div>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-[var(--bg-sidebar)]">
                <button
                  type="button"
                  title="Align left"
                  aria-label="Align left"
                  onClick={() => onUpdate({textAlign: 'left'})}
                  className={`py-1.5 flex items-center justify-center rounded transition-colors cursor-pointer ${
                    prefs.textAlign === 'left'
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Justify text"
                  aria-label="Justify text"
                  onClick={() => onUpdate({textAlign: 'justify'})}
                  className={`py-1.5 flex items-center justify-center rounded transition-colors cursor-pointer ${
                    prefs.textAlign === 'justify'
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
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
              <span className="text-[11px] font-medium text-[var(--text-muted)]">Text Size</span>
              <span className="font-mono-tabular text-xs text-[var(--text-primary)]">
                {prefs.fontSize}px
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onUpdate({fontSize: Math.max(14, prefs.fontSize - 1)})}
                aria-label="Decrease font size"
                className="p-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="range"
                min={14}
                max={26}
                step={1}
                value={prefs.fontSize}
                onChange={(e) => onUpdate({fontSize: parseInt(e.target.value, 10)})}
                aria-label="Font size"
                className="flex-1 accent-[var(--accent)] cursor-pointer"
              />
              <button
                type="button"
                onClick={() => onUpdate({fontSize: Math.min(26, prefs.fontSize + 1)})}
                aria-label="Increase font size"
                className="p-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Line Spacing & Paragraph Spacing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">Line Height</span>
                <span className="font-mono-tabular text-[11px] text-[var(--text-primary)]">
                  {prefs.lineHeight.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={1.35}
                max={2.1}
                step={0.05}
                value={prefs.lineHeight}
                onChange={(e) => onUpdate({lineHeight: parseFloat(e.target.value)})}
                aria-label="Line height"
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">Paragraph Gap</span>
                <span className="font-mono-tabular text-[11px] text-[var(--text-primary)]">
                  {prefs.paragraphSpacing.toFixed(1)}em
                </span>
              </div>
              <input
                type="range"
                min={0.3}
                max={1.8}
                step={0.1}
                value={prefs.paragraphSpacing}
                onChange={(e) => onUpdate({paragraphSpacing: parseFloat(e.target.value)})}
                aria-label="Paragraph spacing"
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>
          </div>

          {/* First-Line Indent & Line Width */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">First Indent</span>
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
                onChange={(e) => onUpdate({textIndent: parseFloat(e.target.value)})}
                aria-label="First-line paragraph indent"
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  {prefs.readingLayout === 'spread' ? 'Spread Width' : 'Page Width'}
                </span>
                <span className="font-mono-tabular text-[11px] text-[var(--text-primary)]">
                  {prefs.pageWidth}px
                </span>
              </div>
              <input
                type="range"
                min={560}
                max={920}
                step={20}
                value={prefs.pageWidth}
                onChange={(e) => onUpdate({pageWidth: parseInt(e.target.value, 10)})}
                aria-label="Reading column width"
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>
          </div>
        </>
      )}

      {/* Workspace Pinning Shortcuts */}
      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
        <div className="text-[11px] font-medium text-[var(--text-muted)]">Pinned Workspace</div>
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-xs text-[var(--text-primary)]">Pin top header</span>
          <input
            type="checkbox"
            checked={prefs.pinHeader}
            onChange={(e) => onUpdate({pinHeader: e.target.checked})}
            className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
          />
        </label>
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-xs text-[var(--text-primary)]">Pin bottom scrubber</span>
          <input
            type="checkbox"
            checked={prefs.pinBottomBar}
            onChange={(e) => onUpdate({pinBottomBar: e.target.checked})}
            className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
          />
        </label>
        <label className="hidden lg:flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-xs text-[var(--text-primary)]">Pin left navigation sidebar</span>
          <input
            type="checkbox"
            checked={prefs.pinLeftSidebar}
            onChange={(e) => onUpdate({pinLeftSidebar: e.target.checked})}
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
