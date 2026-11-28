import React, { useEffect, useMemo, useRef, useState } from "react";
import { common, createLowlight } from "lowlight";
import { Check, ChevronDown, ChevronUp, Copy, Highlighter, WrapText } from "lucide-react";
import type { AiMarginAnnotationColor } from "../../types/aiVault";
import { HIGHLIGHT_COLORS } from "./aiVaultUiUtils";

const lowlight = createLowlight(common);

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  jsx: "javascript",
  tsx: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  cs: "csharp",
  "c#": "csharp",
  "c++": "cpp",
};

interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHast(node: HastNode): string {
  if (node.type === "text") return escapeHtml(node.value || "");
  if (node.type === "element" && node.tagName) {
    const cls = node.properties?.className?.join(" ");
    const attr = cls ? ` class="${escapeHtml(cls)}"` : "";
    const inner = (node.children || []).map(renderHast).join("");
    return `<${node.tagName}${attr}>${inner}</${node.tagName}>`;
  }
  if (node.children) return node.children.map(renderHast).join("");
  return "";
}

function highlightCode(code: string, lang?: string | null): string {
  const rawLang = (lang || "").trim().toLowerCase();
  if (!rawLang || rawLang === "plaintext" || rawLang === "text" || rawLang === "plain") {
    return escapeHtml(code);
  }
  const resolved = LANGUAGE_ALIASES[rawLang] || rawLang;
  try {
    if (lowlight.registered(resolved)) {
      const tree = lowlight.highlight(resolved, code) as unknown as HastNode;
      return renderHast(tree);
    }
    const auto = lowlight.highlightAuto(code) as unknown as HastNode;
    return renderHast(auto);
  } catch {
    return escapeHtml(code);
  }
}

function sanitizeTableStyle(rawStyle: string, tagName: string): string {
  const safeDecls: string[] = [];
  for (const decl of rawStyle.split(";")) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx <= 0) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim().toLowerCase();
    if (!val || /url\(|expression\(|javascript:/i.test(val)) continue;
    if ((tagName === "th" || tagName === "td") && prop === "text-align") {
      if (val === "left" || val === "center" || val === "right") {
        safeDecls.push(`text-align: ${val}`);
      }
    } else if (
      (tagName === "table" || tagName === "col") &&
      (prop === "width" || prop === "min-width")
    ) {
      if (/^\d+(?:\.\d+)?(px|%)$/.test(val)) {
        safeDecls.push(`${prop}: ${val}`);
      }
    }
  }
  return safeDecls.join("; ");
}

type TurnRenderSegment =
  | { kind: "html"; html: string; hasTable: boolean }
  | { kind: "code"; language: string; code: string; highlightedHtml: string };

function sanitizeHtmlElementTree(root: HTMLElement): void {
  root.querySelectorAll("script, style, iframe, object, embed, link").forEach((el) => el.remove());
  root.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const trimmedHref = name === "href" ? attr.value.trim().toLowerCase() : "";
      if (
        name.startsWith("on") ||
        (name === "href" &&
          (trimmedHref.startsWith("javascript:") ||
            trimmedHref.startsWith("data:") ||
            trimmedHref.startsWith("vbscript:")))
      ) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "style") {
        if (tag === "table" || tag === "col" || tag === "th" || tag === "td") {
          const safeStyle = sanitizeTableStyle(attr.value, tag);
          if (safeStyle) el.setAttribute("style", safeStyle);
          else el.removeAttribute("style");
        } else {
          el.removeAttribute("style");
        }
      }
    }

    if (tag === "a") {
      const href = (el.getAttribute("href") || "").trim();
      if (href) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
    }

    if ((tag === "th" || tag === "td") && !el.getAttribute("style")) {
      const legacyAlign = (el.getAttribute("align") || "").trim().toLowerCase();
      if (legacyAlign === "left" || legacyAlign === "center" || legacyAlign === "right") {
        el.setAttribute("style", `text-align: ${legacyAlign}`);
      }
    }
  });

  const tables = Array.from(root.querySelectorAll("table"));
  tables.forEach((table) => {
    const parent = table.parentElement;
    const alreadyWrapped =
      parent &&
      (parent.classList.contains("tableWrapper") ||
        parent.classList.contains("kanso-table-wrap"));
    if (!alreadyWrapped && parent) {
      const wrapper = root.ownerDocument.createElement("div");
      wrapper.className = "kanso-table-wrap";
      parent.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
}

function splitTurnHtmlIntoSegments(
  rawHtml: string,
  turnId: string,
  activeAnnotationId: string | null,
): TurnRenderSegment[] {
  if (!rawHtml || !rawHtml.trim()) return [];
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return [{ kind: "html", html: rawHtml, hasTable: /<table\b/i.test(rawHtml) }];
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
    sanitizeHtmlElementTree(doc.body);

    // Assign stable IDs to headings for Turn + Heading Outline scroll-spy
    let hIdx = 0;
    doc.body.querySelectorAll("h1, h2, h3").forEach((h) => {
      h.setAttribute("data-ai-heading-id", `${turnId}::h${hIdx}`);
      hIdx += 1;
    });

    // Highlight active annotation mark if present
    if (activeAnnotationId) {
      doc.body
        .querySelectorAll(`mark[data-annotation-id="${activeAnnotationId}"]`)
        .forEach((m) => m.classList.add("kanso-mark-active"));
    }

    const segments: TurnRenderSegment[] = [];
    let htmlBuffer: string[] = [];

    const flushHtml = () => {
      if (htmlBuffer.length === 0) return;
      const joined = htmlBuffer.join("");
      htmlBuffer = [];
      if (joined.trim()) {
        segments.push({
          kind: "html",
          html: joined,
          hasTable: /<table\b/i.test(joined),
        });
      }
    };

    for (const child of Array.from(doc.body.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.tagName.toLowerCase() === "pre") {
          flushHtml();
          const codeEl = el.querySelector("code");
          const preLang = el.getAttribute("data-language");
          const codeClass = codeEl?.getAttribute("class") || "";
          const classMatch = codeClass.match(/language-([a-z0-9+#-]+)/i);
          const lang = preLang || classMatch?.[1] || "plaintext";
          const codeText = codeEl ? codeEl.textContent || "" : el.textContent || "";
          segments.push({
            kind: "code",
            language: lang,
            code: codeText,
            highlightedHtml: highlightCode(codeText, lang),
          });
          continue;
        }
        htmlBuffer.push(el.outerHTML);
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        htmlBuffer.push(`<p>${escapeHtml(child.textContent)}</p>`);
      }
    }
    flushHtml();
    return segments;
  } catch {
    return [{ kind: "html", html: rawHtml, hasTable: /<table\b/i.test(rawHtml) }];
  }
}

interface InteractiveCodeBlockProps {
  language: string;
  code: string;
  highlightedHtml: string;
  onRequestEdit?: () => void;
}

const InteractiveCodeBlock: React.FC<InteractiveCodeBlockProps> = ({
  language,
  code,
  highlightedHtml,
  onRequestEdit,
}) => {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const lineCount = useMemo(() => (code ? code.split("\n").length : 1), [code]);
  const [collapsed, setCollapsed] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <div
      className="kanso-code-block-shell my-2.5 rounded-lg border overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center justify-between gap-2 px-2.5 py-1 border-b text-[11px] select-none"
        style={{
          backgroundColor: "var(--bg-surface-subtle)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-semibold" style={{ color: "var(--text-secondary)" }}>
            {language || "plaintext"}
          </span>
          <span className="font-mono tabular-nums text-[10px] opacity-75">
            {lineCount} {lineCount === 1 ? "line" : "lines"}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setWrapped((v) => !v)}
            className="h-6 px-1.5 rounded inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{
              backgroundColor: wrapped ? "var(--accent-soft)" : "transparent",
              color: wrapped ? "var(--accent)" : "var(--text-muted)",
            }}
            title={wrapped ? "Disable word wrap" : "Enable word wrap"}
          >
            <WrapText className="w-3 h-3" />
            <span className="hidden sm:inline">Wrap</span>
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="h-6 px-1.5 rounded inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            title={collapsed ? "Expand code" : "Collapse code"}
          >
            {collapsed ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronUp className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">{collapsed ? "Expand" : "Collapse"}</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="h-6 px-1.5 rounded inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: copied ? "var(--accent)" : "var(--text-muted)" }}
            title="Copy code"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      {!collapsed && (
        <pre
          data-language={language}
          onDoubleClick={onRequestEdit}
          className={`!m-0 !border-0 !rounded-none ${
            wrapped ? "whitespace-pre-wrap break-words overflow-x-hidden" : "overflow-x-auto"
          }`}
        >
          <code
            className={`language-${language} ${wrapped ? "whitespace-pre-wrap break-words" : ""}`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </pre>
      )}
    </div>
  );
};

interface AiTurnRendererProps {
  turnId: string;
  html: string;
  activeAnnotationId: string | null;
  onSelectAnnotation?: (annotationId: string) => void;
  onOpenNote?: (noteId: string, title?: string) => void;
  onAnnotateQuote?: (quoteText: string, color: AiMarginAnnotationColor) => void;
  onRequestEdit?: () => void;
}

export const AiTurnRenderer: React.FC<AiTurnRendererProps> = ({
  turnId,
  html,
  activeAnnotationId,
  onSelectAnnotation,
  onOpenNote,
  onAnnotateQuote,
  onRequestEdit,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [readSelection, setReadSelection] = useState<{
    quote: string;
    top: number;
    left: number;
  } | null>(null);

  const segments = useMemo(
    () => splitTurnHtmlIntoSegments(html, turnId, activeAnnotationId),
    [html, turnId, activeAnnotationId],
  );

  useEffect(() => {
    if (!readSelection) return;
    const dismiss = () => setReadSelection(null);
    window.addEventListener("scroll", dismiss, true);
    return () => window.removeEventListener("scroll", dismiss, true);
  }, [readSelection]);

  const handleMouseUp = () => {
    if (!onAnnotateQuote || typeof window === "undefined") return;
    const sel = window.getSelection();
    const root = containerRef.current;
    if (!sel || sel.isCollapsed || !root) {
      setReadSelection(null);
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 2 || !root.contains(sel.anchorNode)) {
      setReadSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const clampedLeft = Math.max(
      110,
      Math.min(window.innerWidth - 110, rect.left + rect.width / 2),
    );
    const top = rect.top < 56 ? rect.bottom + 8 : rect.top - 42;
    setReadSelection({
      quote: text,
      top,
      left: clampedLeft,
    });
  };

  if (segments.length === 0) {
    return (
      <p
        onClick={onRequestEdit}
        className="text-sm italic cursor-text"
        style={{ color: "var(--text-muted)" }}
      >
        Empty turn — click Edit to write content...
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const markEl = target.closest("mark[data-annotation-id]") as HTMLElement | null;
        if (markEl) {
          const aid = markEl.getAttribute("data-annotation-id");
          if (aid && onSelectAnnotation) {
            e.stopPropagation();
            onSelectAnnotation(aid);
            return;
          }
        }
        const wikiEl = target.closest("[data-wiki-note-id]") as HTMLElement | null;
        if (wikiEl && onOpenNote) {
          e.preventDefault();
          e.stopPropagation();
          const noteId = wikiEl.getAttribute("data-wiki-note-id");
          const title = wikiEl.textContent || undefined;
          if (noteId) onOpenNote(noteId, title);
        }
      }}
      className="relative"
    >
      {segments.map((seg, idx) =>
        seg.kind === "code" ? (
          <InteractiveCodeBlock
            key={`${turnId}-code-${idx}`}
            language={seg.language}
            code={seg.code}
            highlightedHtml={seg.highlightedHtml}
            onRequestEdit={onRequestEdit}
          />
        ) : (
          <div
            key={`${turnId}-html-${idx}`}
            className={`kanso-rich-content kanso-ai-prose ${
              seg.hasTable ? "kanso-rich-has-table" : ""
            }`}
            dangerouslySetInnerHTML={{ __html: seg.html }}
          />
        ),
      )}

      {readSelection && onAnnotateQuote && (
        <div
          className="fixed z-50 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-xl border"
          style={{
            top: readSelection.top,
            left: readSelection.left,
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-popover)",
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium pr-1"
            style={{ color: "var(--text-secondary)" }}
          >
            <Highlighter className="w-3 h-3" style={{ color: "var(--accent)" }} />
            <span>Highlight</span>
          </span>
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                const quote = readSelection.quote;
                setReadSelection(null);
                window.getSelection()?.removeAllRanges();
                onAnnotateQuote(quote, c.id);
              }}
              title={`Highlight ${c.label} & add note`}
              aria-label={`Highlight ${c.label}`}
              className="w-5 h-5 rounded-full border border-black/15 cursor-pointer hover:scale-110 transition-transform"
              style={{ backgroundColor: c.swatch }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
