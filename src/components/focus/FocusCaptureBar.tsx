import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  CornerDownLeft,
  Hash,
  Slash,
  Target,
} from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { CustomFocusTab } from "../../types";
import { formatTime } from "../../utils/date";
import { parseNlpInput } from "../../utils/nlp";

export type TodayCaptureBucket = "x-active" | "anchor" | "completed";

export interface FocusCaptureSubmitTarget {
  bucket: TodayCaptureBucket | "custom-tab";
  tabId?: string;
}

interface SlashCommandOption {
  id: string;
  command: string;
  label: string;
  hint: string;
  target: FocusCaptureSubmitTarget;
  color?: string;
}

interface FocusCaptureBarProps {
  customTabs: CustomFocusTab[];
  baseDateKey: string;
  xActiveCount: number;
  xLimit: number;
  availableTags: string[];
  bucket: TodayCaptureBucket;
  onBucketChange: (next: TodayCaptureBucket) => void;
  onSubmitItem: (
    target: FocusCaptureSubmitTarget,
    rawTextForNlp: string,
  ) => boolean;
  previewPosition?: "bottom" | "top";
  elevated?: boolean;
  compact?: boolean;
  prefillSeed?: {
    nonce: number;
    text: string;
    bucket?: TodayCaptureBucket;
  } | null;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSlashSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

export const FocusCaptureBar: React.FC<FocusCaptureBarProps> = ({
  customTabs,
  baseDateKey,
  xActiveCount,
  xLimit,
  availableTags,
  bucket,
  onBucketChange,
  onSubmitItem,
  previewPosition = "bottom",
  elevated = false,
  compact = false,
  prefillSeed,
}) => {
  const { workspace } = useWorkspace();
  const [value, setValue] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!prefillSeed) return;
    if (prefillSeed.bucket) {
      onBucketChange(prefillSeed.bucket);
    }
    setValue(prefillSeed.text);
    setSlashDismissed(false);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }, [prefillSeed, onBucketChange]);

  const slashCommands = useMemo<SlashCommandOption[]>(() => {
    const base: SlashCommandOption[] = [
      {
        id: "cmd-active",
        command: "/active",
        label: "X-Active Task",
        hint: `Focus queue (${xActiveCount}/${xLimit})`,
        target: { bucket: "x-active" },
      },
      {
        id: "cmd-anchor",
        command: "/anchor",
        label: "Daily Anchor",
        hint: "Schedule commitment today",
        target: { bucket: "anchor" },
      },
      {
        id: "cmd-done",
        command: "/done",
        label: "Log Done",
        hint: "Record completed work",
        target: { bucket: "completed" },
      },
    ];
    for (const ct of customTabs) {
      const slug = normalizeSlashSlug(ct.name) || ct.name.trim().toLowerCase();
      base.push({
        id: `cmd-tab-${ct.id}`,
        command: `/${slug}`,
        label: ct.name,
        hint: "Custom Focus Tab",
        target: { bucket: "custom-tab", tabId: ct.id },
        color: ct.color,
      });
    }
    return base;
  }, [customTabs, xActiveCount, xLimit]);

  // Match committed leading prefix like "/anchor buy milk", "/active call", "/done review", or "/<custom tab> ..."
  const detectedPrefix = useMemo<{
    target: FocusCaptureSubmitTarget;
    customTab?: CustomFocusTab;
    strippedText: string;
    matchedPrefix: string;
  } | null>(() => {
    const trimmedStart = value.trimStart();
    if (!trimmedStart.startsWith("/")) return null;

    const builtInMatch = trimmedStart.match(
      /^\/(active|xactive|x-active|anchor|done|log)(?:\s+|$)/i,
    );
    if (builtInMatch) {
      const kw = builtInMatch[1].toLowerCase();
      const targetBucket: TodayCaptureBucket =
        kw === "anchor"
          ? "anchor"
          : kw === "done" || kw === "log"
            ? "completed"
            : "x-active";
      return {
        target: { bucket: targetBucket },
        strippedText: trimmedStart.slice(builtInMatch[0].length),
        matchedPrefix: builtInMatch[0],
      };
    }

    // Match custom tab by exact name or slug (longest first so multi-word names win)
    const sortedTabs = [...customTabs].sort(
      (a, b) => b.name.length - a.name.length,
    );
    for (const ct of sortedTabs) {
      const rawName = ct.name.trim();
      const slug = normalizeSlashSlug(rawName);
      const candidates = [rawName, slug].filter(Boolean);
      for (const cand of candidates) {
        const rx = new RegExp(`^\\/${escapeRegExp(cand)}(?:\\s+|$)`, "i");
        const m = trimmedStart.match(rx);
        if (m) {
          return {
            target: { bucket: "custom-tab", tabId: ct.id },
            customTab: ct,
            strippedText: trimmedStart.slice(m[0].length),
            matchedPrefix: m[0],
          };
        }
      }
    }

    return null;
  }, [value, customTabs]);

  // Sync segmented bucket toggle bidirectionally when a built-in /prefix is typed
  useEffect(() => {
    if (!detectedPrefix) return;
    const b = detectedPrefix.target.bucket;
    if (b === "x-active" || b === "anchor" || b === "completed") {
      if (b !== bucket) {
        onBucketChange(b);
      }
    }
  }, [detectedPrefix, bucket, onBucketChange]);

  // Detect active leading "/" typing without whitespace yet (for Notion-style slash helper popup)
  const activeSlashQuery = useMemo(() => {
    const trimmedStart = value.trimStart();
    if (!trimmedStart.startsWith("/")) return null;
    if (detectedPrefix && !/\s/.test(trimmedStart) === false) {
      // Prefix already committed with space — close command menu
      return null;
    }
    if (/\s/.test(trimmedStart)) return null;
    return trimmedStart.slice(1).toLowerCase();
  }, [value, detectedPrefix]);

  useEffect(() => {
    if (activeSlashQuery === null) {
      setSlashDismissed(false);
    } else {
      setSlashIndex(0);
    }
  }, [activeSlashQuery]);

  const slashSuggestions = useMemo(() => {
    if (activeSlashQuery === null || slashDismissed) return [];
    const q = activeSlashQuery;
    if (!q) return slashCommands;
    return slashCommands.filter(
      (c) =>
        c.command.slice(1).includes(q) ||
        c.label.toLowerCase().includes(q),
    );
  }, [activeSlashQuery, slashDismissed, slashCommands]);

  const effectiveTextForNlp = detectedPrefix
    ? detectedPrefix.strippedText
    : value;

  const parsed = useMemo(
    () =>
      parseNlpInput(
        effectiveTextForNlp,
        baseDateKey,
        workspace.settings.timeFormat,
      ),
    [effectiveTextForNlp, baseDateKey, workspace.settings.timeFormat],
  );

  // Detect active #tag autocomplete at end
  const tagSuggestions = useMemo(() => {
    if (availableTags.length === 0) return [];
    const match = value.match(/(?:^|\s)#([a-zA-Z0-9_-]*)$/);
    if (!match) return [];
    const prefix = match[1].toLowerCase();
    return availableTags
      .filter((t) => !parsed.tags.includes(t) && t.toLowerCase().startsWith(prefix))
      .slice(0, 6);
  }, [value, availableTags, parsed.tags]);

  const activeTarget: FocusCaptureSubmitTarget = detectedPrefix
    ? detectedPrefix.target
    : { bucket };

  const activeCustomTab = detectedPrefix?.customTab ?? null;

  const isXFull =
    activeTarget.bucket === "x-active" && xActiveCount >= xLimit;

  const timeRouteSuggestion = useMemo(() => {
    if (
      activeTarget.bucket === "anchor" ||
      activeTarget.bucket === "custom-tab" ||
      !parsed.scheduledAt
    ) {
      return null;
    }
    return formatTime(parsed.scheduledAt, workspace.settings.timeFormat);
  }, [
    activeTarget.bucket,
    parsed.scheduledAt,
    workspace.settings.timeFormat,
  ]);

  const applySlashCommand = (cmd: SlashCommandOption) => {
    if (
      cmd.target.bucket === "x-active" ||
      cmd.target.bucket === "anchor" ||
      cmd.target.bucket === "completed"
    ) {
      onBucketChange(cmd.target.bucket);
    }
    setValue(`${cmd.command} `);
    setSlashDismissed(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleToggleBucketClick = (next: TodayCaptureBucket) => {
    onBucketChange(next);
    if (detectedPrefix) {
      const cmdPrefix =
        next === "anchor"
          ? "/anchor "
          : next === "completed"
            ? "/done "
            : "/active ";
      setValue(`${cmdPrefix}${detectedPrefix.strippedText}`);
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleRouteTimeAsAnchor = () => {
    onBucketChange("anchor");
    if (detectedPrefix) {
      setValue(`/anchor ${detectedPrefix.strippedText}`);
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const applyTagSuggestion = (tag: string) => {
    setValue((prev) => prev.replace(/(^|\s)#[a-zA-Z0-9_-]*$/, `$1#${tag} `));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = effectiveTextForNlp.trim();
    if (!cleaned) return;
    const ok = onSubmitItem(activeTarget, effectiveTextForNlp);
    if (ok) {
      setValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (slashSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex(
          (i) => (i - 1 + slashSuggestions.length) % slashSuggestions.length,
        );
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const chosen = slashSuggestions[slashIndex] ?? slashSuggestions[0];
        if (chosen) applySlashCommand(chosen);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }
  };

  const placeholderText = activeCustomTab
    ? `Add task to ${activeCustomTab.name}...`
    : activeTarget.bucket === "anchor"
      ? 'Schedule anchor (e.g., "Standup at 2pm", "Deep craft 9am–11am")...'
      : activeTarget.bucket === "completed"
        ? 'Log done (e.g., "Shipped focus view redesign at 4pm")...'
        : isXFull
          ? `X-Active full (${xActiveCount}/${xLimit}) — submit to swap or switch bucket`
          : 'Add active task (or type "/" for /anchor, /active, /done, /tab)...';

  const hasPreview =
    Boolean(timeRouteSuggestion) ||
    parsed.tokens.length > 0 ||
    Boolean(activeCustomTab);

  const previewNode = hasPreview ? (
    <div
      className={`${
        previewPosition === "top"
          ? "mb-1.5 px-3 py-1.5 rounded-xl border"
          : "mt-1.5 px-1"
      } flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs`}
      style={{
        backgroundColor:
          previewPosition === "top" ? "var(--bg-elevated)" : "transparent",
        borderColor:
          previewPosition === "top" ? "var(--border-subtle)" : "transparent",
        boxShadow: previewPosition === "top" ? "var(--shadow-popover)" : "none",
      }}
    >
      {activeCustomTab && (
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium"
          style={{ color: activeCustomTab.color }}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: activeCustomTab.color }}
          />
          <span>Routing to {activeCustomTab.name}</span>
        </span>
      )}

      {parsed.tokens.map((tok, i) => (
        <span
          key={`${tok.kind}-${tok.label}-${i}`}
          className="inline-flex items-center gap-1 font-mono tabular-nums text-[11px]"
          style={{
            color:
              tok.kind === "tag" ? "var(--text-secondary)" : "var(--accent)",
          }}
        >
          {tok.kind === "tag" ? (
            <Hash className="w-3 h-3 shrink-0" />
          ) : (
            <Clock className="w-3 h-3 shrink-0" />
          )}
          <span>{tok.label}</span>
        </span>
      ))}

      {timeRouteSuggestion && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleRouteTimeAsAnchor}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors hover:opacity-90 cursor-pointer"
          style={{
            backgroundColor: "var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          <Clock className="w-3 h-3 shrink-0" />
          <span>{timeRouteSuggestion} detected · Route as Anchor →</span>
        </button>
      )}
    </div>
  ) : null;

  return (
    <form onSubmit={handleSubmit} className="w-full relative">
      {/* Notion-style Slash Command Popup */}
      {slashSuggestions.length > 0 && (
        <div
          className={`absolute left-0 right-0 sm:right-auto sm:w-80 z-40 rounded-xl border p-1.5 space-y-0.5 ${
            previewPosition === "top" ? "bottom-full mb-2" : "top-full mt-1.5"
          }`}
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-popover)",
          }}
          role="listbox"
          aria-label="Quick route slash commands"
        >
          <div
            className="px-2.5 py-1 text-[11px] font-medium flex items-center justify-between"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="inline-flex items-center gap-1">
              <Slash className="w-3 h-3" />
              <span>Route capture</span>
            </span>
            <span className="font-mono text-[10px]">↑↓ · Enter</span>
          </div>
          {slashSuggestions.map((cmd, idx) => {
            const highlighted = idx === slashIndex;
            return (
              <button
                key={cmd.id}
                type="button"
                role="option"
                aria-selected={highlighted}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySlashCommand(cmd);
                }}
                onMouseEnter={() => setSlashIndex(idx)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer"
                style={{
                  backgroundColor: highlighted
                    ? "var(--accent-soft)"
                    : "transparent",
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {cmd.color ? (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cmd.color }}
                    />
                  ) : cmd.target.bucket === "anchor" ? (
                    <Clock
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: "var(--accent)" }}
                    />
                  ) : cmd.target.bucket === "completed" ? (
                    <CheckCircle2
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: "var(--success)" }}
                    />
                  ) : (
                    <Target
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: "var(--color-entity-blue)" }}
                    />
                  )}
                  <div className="min-w-0">
                    <div
                      className="text-xs font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {cmd.label}
                    </div>
                    <div
                      className="text-[11px] truncate"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {cmd.hint}
                    </div>
                  </div>
                </div>
                <span
                  className="text-[11px] font-mono shrink-0"
                  style={{
                    color: highlighted ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {cmd.command}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* #tag Autocomplete */}
      {tagSuggestions.length > 0 && slashSuggestions.length === 0 && (
        <div
          className={`absolute left-2 z-30 flex flex-wrap gap-1.5 p-2 rounded-xl border ${
            previewPosition === "top" ? "bottom-full mb-2" : "top-full mt-1.5"
          }`}
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-popover)",
          }}
        >
          {tagSuggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyTagSuggestion(tag);
              }}
              className="px-2 py-1 rounded-md text-xs font-mono transition-colors hover:bg-[var(--accent-soft)]"
              style={{ color: "var(--accent)" }}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {previewPosition === "top" && previewNode}

      <div
        className={`rounded-2xl border transition-colors ${
          compact ? "p-1.5 space-y-1.5" : "p-2 space-y-1.5"
        }`}
        style={{
          backgroundColor: elevated
            ? "var(--bg-elevated)"
            : "var(--bg-surface)",
          borderColor: elevated
            ? "var(--border-strong)"
            : "var(--border-subtle)",
          boxShadow: elevated ? "var(--shadow-popover)" : "none",
        }}
      >
        {/* Top / Segmented Target Selector Bar */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          <div
            className="inline-flex items-center gap-0.5 p-0.5 rounded-lg"
            style={{ backgroundColor: "var(--bg-surface-subtle)" }}
            role="tablist"
            aria-label="Capture bucket"
          >
            {(
              [
                {
                  id: "x-active" as const,
                  label: "Active",
                  icon: Target,
                },
                {
                  id: "anchor" as const,
                  label: "Anchor",
                  icon: Clock,
                },
                {
                  id: "completed" as const,
                  label: "Done",
                  icon: CheckCircle2,
                },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const isSelected = !activeCustomTab && bucket === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => handleToggleBucketClick(opt.id)}
                  className="h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: isSelected
                      ? "var(--bg-surface)"
                      : "transparent",
                    color: isSelected
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    boxShadow: isSelected
                      ? "0 1px 2px rgba(0,0,0,0.06)"
                      : "none",
                  }}
                >
                  <Icon
                    className="w-3.5 h-3.5 shrink-0"
                    style={{
                      color: isSelected
                        ? opt.id === "completed"
                          ? "var(--success)"
                          : "var(--accent)"
                        : "var(--text-muted)",
                    }}
                  />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <div
            className="flex items-center gap-2 text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0 pr-1"
            style={{ color: "var(--text-muted)" }}
          >
            {activeCustomTab ? (
              <span
                className="inline-flex items-center gap-1.5 font-sans font-medium"
                style={{ color: activeCustomTab.color }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: activeCustomTab.color }}
                />
                <span>{activeCustomTab.name}</span>
              </span>
            ) : (
              <span className="hidden sm:inline">
                Type / for commands · #tag · time
              </span>
            )}
          </div>
        </div>

        {/* Input Row */}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSlashDismissed(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:opacity-60 min-h-[36px] px-1.5"
            style={{ color: "var(--text-primary)" }}
            aria-label="Quick capture for Focus View"
          />

          <button
            type="submit"
            disabled={!effectiveTextForNlp.trim()}
            className="h-9 px-3 sm:px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-opacity whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer"
            style={{
              backgroundColor: effectiveTextForNlp.trim()
                ? "var(--accent)"
                : "var(--bg-surface-subtle)",
              color: effectiveTextForNlp.trim()
                ? "var(--accent-fg)"
                : "var(--text-muted)",
            }}
          >
            <span className="hidden sm:inline">
              {activeCustomTab
                ? "Add"
                : activeTarget.bucket === "anchor"
                  ? "Anchor"
                  : activeTarget.bucket === "completed"
                    ? "Log Done"
                    : "Queue"}
            </span>
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {previewPosition === "bottom" && previewNode}
    </form>
  );
};
