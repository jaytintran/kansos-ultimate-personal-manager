import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Check } from "lucide-react";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

const CHECKLIST_LINE_RE = /^(\s*)-\s*\[([ xX]?)\](.*)$/;

export function hasScratchpadCheckbox(content: string): boolean {
  if (!content) return false;
  return content
    .split(/\r?\n/)
    .some((line) => CHECKLIST_LINE_RE.test(line));
}

export function isScratchpadSingleLinePlain(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (/[\r\n]/.test(content)) return false;
  if (hasScratchpadCheckbox(content)) return false;
  return true;
}

type ScratchpadBlock =
  | {
      kind: "plain";
      startLine: number;
      endLine: number;
      text: string;
    }
  | {
      kind: "checkbox";
      lineIdx: number;
      indent: string;
      checked: boolean;
      text: string;
    };

function parseBlocks(content: string): ScratchpadBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: ScratchpadBlock[] = [];
  let plainBuffer: string[] = [];
  let plainStart = 0;

  const flushPlain = (endLine: number) => {
    if (plainBuffer.length === 0) return;
    blocks.push({
      kind: "plain",
      startLine: plainStart,
      endLine,
      text: plainBuffer.join("\n"),
    });
    plainBuffer = [];
  };

  lines.forEach((line, idx) => {
    const m = line.match(CHECKLIST_LINE_RE);
    if (m) {
      flushPlain(idx - 1);
      const rawBracket = m[2] || "";
      const checked = rawBracket.toLowerCase() === "x";
      // Strip one optional leading space after "]" for display/edit cleanliness
      const rawAfter = m[3] || "";
      const text = rawAfter.startsWith(" ") ? rawAfter.slice(1) : rawAfter;
      blocks.push({
        kind: "checkbox",
        lineIdx: idx,
        indent: m[1] || "",
        checked,
        text,
      });
    } else {
      if (plainBuffer.length === 0) {
        plainStart = idx;
      }
      plainBuffer.push(line);
    }
  });

  flushPlain(lines.length - 1);
  return blocks;
}

interface ScratchpadEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  textColor: string;
  bgColor: string;
  placeholder?: string;
  minRows?: number;
  className?: string;
}

export const ScratchpadEditor: React.FC<ScratchpadEditorProps> = ({
  value,
  onChange,
  textColor,
  bgColor,
  placeholder = "Write a quick note...",
  minRows = 2,
  className = "text-sm leading-relaxed",
}) => {
  const blocks = useMemo(() => parseBlocks(value), [value]);

  const inputRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const pendingFocusRef = useRef<{
    key: string;
    caret: number;
  } | null>(null);
  const justConvertedRef = useRef<{
    lineIdx: number;
    at: number;
  } | null>(null);

  const registerRef = useCallback(
    (key: string) => (el: HTMLTextAreaElement | null) => {
      if (el) inputRefs.current.set(key, el);
      else inputRefs.current.delete(key);
    },
    [],
  );

  useLayoutEffect(() => {
    const req = pendingFocusRef.current;
    if (!req) return;
    const el = inputRefs.current.get(req.key);
    if (!el) return;
    pendingFocusRef.current = null;
    el.focus();
    const pos = Math.max(0, Math.min(req.caret, el.value.length));
    el.setSelectionRange(pos, pos);
  }, [blocks]);

  const handleToggleCheckbox = (lineIdx: number) => {
    const lines = value.split(/\r?\n/);
    const line = lines[lineIdx];
    if (line === undefined) return;
    const m = line.match(CHECKLIST_LINE_RE);
    if (!m) return;
    const isChecked = (m[2] || "").toLowerCase() === "x";
    const after = m[3] || "";
    const normalizedAfter = after.startsWith(" ")
      ? after
      : after
        ? ` ${after}`
        : " ";
    lines[lineIdx] = `${m[1]}- [${isChecked ? " " : "x"}]${normalizedAfter}`;
    onChange(lines.join("\n"));
  };

  const handlePlainBlockChange = (
    startLine: number,
    endLine: number,
    nextBlockText: string,
  ) => {
    const allLines = value.split(/\r?\n/);
    const replacementLines = nextBlockText.split(/\r?\n/);

    let convertedLineIdx: number | null = null;
    let convertedCaret = 0;

    const normalizedReplacement = replacementLines.map((line, offset) => {
      const m = line.match(CHECKLIST_LINE_RE);
      if (!m) return line;
      const globalIdx = startLine + offset;
      const checkedChar = (m[2] || "").toLowerCase() === "x" ? "x" : " ";
      const after = m[3] || "";
      const body = after.startsWith(" ") ? after.slice(1) : after;
      convertedLineIdx = globalIdx;
      convertedCaret = body.length;
      if (body === "") {
        justConvertedRef.current = { lineIdx: globalIdx, at: Date.now() };
      }
      return `${m[1]}- [${checkedChar}] ${body}`;
    });

    const nextAll = [
      ...allLines.slice(0, startLine),
      ...normalizedReplacement,
      ...allLines.slice(endLine + 1),
    ];

    if (convertedLineIdx !== null) {
      pendingFocusRef.current = {
        key: `cb-${convertedLineIdx}`,
        caret: convertedCaret,
      };
    }

    onChange(nextAll.join("\n"));
  };

  const handleCheckboxTextChange = (
    lineIdx: number,
    indent: string,
    checked: boolean,
    nextText: string,
  ) => {
    const cleanText = nextText.replace(/\r?\n/g, " ");
    let finalText = cleanText;

    // Swallow the trailing space if user typed "- [] " seamlessly across conversion
    if (
      justConvertedRef.current &&
      justConvertedRef.current.lineIdx === lineIdx &&
      Date.now() - justConvertedRef.current.at < 1500
    ) {
      justConvertedRef.current = null;
      if (cleanText === " ") {
        finalText = "";
      }
    }

    const lines = value.split(/\r?\n/);
    lines[lineIdx] = `${indent}- [${checked ? "x" : " "}] ${finalText}`;
    onChange(lines.join("\n"));
  };

  const focusBlockEdge = (blockIndex: number, edge: "start" | "end") => {
    const target = blocks[blockIndex];
    if (!target) return;
    if (target.kind === "checkbox") {
      const el = inputRefs.current.get(`cb-${target.lineIdx}`);
      if (!el) return;
      el.focus();
      const pos = edge === "start" ? 0 : el.value.length;
      el.setSelectionRange(pos, pos);
    } else {
      const el = inputRefs.current.get(`plain-${target.startLine}`);
      if (!el) return;
      el.focus();
      const pos = edge === "start" ? 0 : el.value.length;
      el.setSelectionRange(pos, pos);
    }
  };

  const handleCheckboxKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    blockIndex: number,
    block: Extract<ScratchpadBlock, { kind: "checkbox" }>,
  ) => {
    const el = e.currentTarget;
    const selStart = el.selectionStart ?? 0;
    const selEnd = el.selectionEnd ?? 0;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const lines = value.split(/\r?\n/);

      if (!block.text.trim()) {
        // Empty checklist item -> exit checklist mode into plain text line
        lines[block.lineIdx] = block.indent;
        const prevBlock = blocks[blockIndex - 1];
        if (prevBlock && prevBlock.kind === "plain") {
          pendingFocusRef.current = {
            key: `plain-${prevBlock.startLine}`,
            caret: prevBlock.text.length + 1,
          };
        } else {
          pendingFocusRef.current = {
            key: `plain-${block.lineIdx}`,
            caret: block.indent.length,
          };
        }
        onChange(lines.join("\n"));
        return;
      }

      // Split current checkbox line and add a new "- [ ] " checkbox below
      const before = block.text.slice(0, selStart);
      const after = block.text.slice(selEnd);
      lines[block.lineIdx] =
        `${block.indent}- [${block.checked ? "x" : " "}] ${before}`;
      lines.splice(block.lineIdx + 1, 0, `${block.indent}- [ ] ${after}`);
      pendingFocusRef.current = {
        key: `cb-${block.lineIdx + 1}`,
        caret: 0,
      };
      onChange(lines.join("\n"));
      return;
    }

    if (e.key === "Backspace" && selStart === 0 && selEnd === 0) {
      e.preventDefault();
      const lines = value.split(/\r?\n/);
      lines[block.lineIdx] = `${block.indent}${block.text}`;

      const prevBlock = blocks[blockIndex - 1];
      if (prevBlock && prevBlock.kind === "plain") {
        pendingFocusRef.current = {
          key: `plain-${prevBlock.startLine}`,
          caret: prevBlock.text.length + 1 + block.indent.length,
        };
      } else {
        pendingFocusRef.current = {
          key: `plain-${block.lineIdx}`,
          caret: block.indent.length,
        };
      }
      onChange(lines.join("\n"));
      return;
    }

    if (e.key === "ArrowUp" && selStart === 0 && blockIndex > 0) {
      e.preventDefault();
      focusBlockEdge(blockIndex - 1, "end");
      return;
    }

    if (
      e.key === "ArrowDown" &&
      selEnd === el.value.length &&
      blockIndex < blocks.length - 1
    ) {
      e.preventDefault();
      focusBlockEdge(blockIndex + 1, "start");
    }
  };

  // Pure plain text fast-path (zero visual overhead unless checklists exist)
  if (blocks.length === 1 && blocks[0].kind === "plain") {
    const onlyBlock = blocks[0];
    return (
      <AutoGrowTextarea
        ref={registerRef(`plain-${onlyBlock.startLine}`)}
        minRows={minRows}
        value={onlyBlock.text}
        onChange={(e) =>
          handlePlainBlockChange(
            onlyBlock.startLine,
            onlyBlock.endLine,
            e.target.value,
          )
        }
        placeholder={placeholder}
        className={`${className} placeholder:opacity-50`}
        style={{ color: textColor }}
      />
    );
  }

  return (
    <div className="space-y-1">
      {blocks.map((block, idx) => {
        if (block.kind === "checkbox") {
          return (
            <div key={`cb-${block.lineIdx}`} className="flex items-start gap-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={block.checked}
                aria-label={
                  block.text ? `Toggle "${block.text}"` : "Toggle checklist item"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCheckbox(block.lineIdx);
                }}
                className="w-4 h-4 rounded-[5px] border-[1.5px] flex items-center justify-center shrink-0 transition-colors cursor-pointer mt-[3px]"
                style={{
                  backgroundColor: block.checked ? textColor : "transparent",
                  borderColor: block.checked
                    ? textColor
                    : `color-mix(in srgb, ${textColor} 58%, transparent)`,
                  color: bgColor,
                }}
              >
                {block.checked && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
              </button>

              <AutoGrowTextarea
                ref={registerRef(`cb-${block.lineIdx}`)}
                minRows={1}
                value={block.text}
                onChange={(e) =>
                  handleCheckboxTextChange(
                    block.lineIdx,
                    block.indent,
                    block.checked,
                    e.target.value,
                  )
                }
                onKeyDown={(e) => handleCheckboxKeyDown(e, idx, block)}
                placeholder="To-do item..."
                className={`${className} placeholder:opacity-45 transition-opacity ${
                  block.checked ? "line-through opacity-55" : ""
                }`}
                style={{ color: textColor }}
              />
            </div>
          );
        }

        return (
          <AutoGrowTextarea
            key={`plain-${block.startLine}`}
            ref={registerRef(`plain-${block.startLine}`)}
            minRows={1}
            value={block.text}
            onChange={(e) =>
              handlePlainBlockChange(
                block.startLine,
                block.endLine,
                e.target.value,
              )
            }
            onKeyDown={(e) => {
              const el = e.currentTarget;
              if (
                e.key === "ArrowUp" &&
                el.selectionStart === 0 &&
                el.selectionEnd === 0 &&
                idx > 0
              ) {
                e.preventDefault();
                focusBlockEdge(idx - 1, "end");
              } else if (
                e.key === "ArrowDown" &&
                el.selectionStart === el.value.length &&
                el.selectionEnd === el.value.length &&
                idx < blocks.length - 1
              ) {
                e.preventDefault();
                focusBlockEdge(idx + 1, "start");
              }
            }}
            placeholder={idx === 0 ? placeholder : ""}
            className={`${className} placeholder:opacity-50`}
            style={{ color: textColor }}
          />
        );
      })}
    </div>
  );
};
