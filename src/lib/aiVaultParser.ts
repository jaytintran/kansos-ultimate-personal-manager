import type {
  AiChatBodyRecord,
  AiChatRecord,
  AiConversationTurn,
  AiMarginAnnotation,
  AiPlatform,
  AiTurnRole,
  AiTurnSource,
} from "../types/aiVault";

export const AI_PLATFORM_LABELS: Record<AiPlatform, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  deepseek: "DeepSeek",
  grok: "Grok",
  other: "Other AI",
};

export const AI_PLATFORM_DEFAULT_MODELS: Record<AiPlatform, string[]> = {
  chatgpt: ["GPT-4o", "o3", "o4-mini", "GPT-4.5", "GPT-4.1"],
  claude: ["Claude 3.7 Sonnet", "Claude 3.5 Sonnet", "Claude 3.5 Haiku", "Claude 4 Sonnet"],
  gemini: ["Gemini 2.5 Pro", "Gemini 2.5 Flash", "Gemini 2.0 Flash", "Gemini Deep Research"],
  perplexity: ["Sonar Pro", "Sonar Reasoning", "Perplexity Deep Research"],
  deepseek: ["DeepSeek-R1", "DeepSeek-V3"],
  grok: ["Grok 3", "Grok 3 Thinking"],
  other: ["Local LLM", "Custom Model"],
};

function makeUid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeHtml(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function renderInlineMarkdown(raw: string): string {
  // Preserve inline code spans first so asterisks/underscores inside code aren't italicized
  const codePlaceholders: string[] = [];
  let text = raw.replace(/`([^`\n]+)`/g, (_m, code) => {
    const idx = codePlaceholders.length;
    codePlaceholders.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000CODE_${idx}\u0000`;
  });

  // Markdown links [label](url)
  const linkPlaceholders: string[] = [];
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => {
    const idx = linkPlaceholders.length;
    linkPlaceholders.push(
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
    );
    return `\u0000LINK_${idx}\u0000`;
  });

  text = escapeHtml(text);

  // Bare URLs
  text = text.replace(
    /(^|\s)(https?:\/\/[^\s<]+)/g,
    (_m, lead, url) => `${lead}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  );

  // Bold, italic, strikethrough
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  text = text.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  text = text.replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, "$1<em>$2</em>");
  text = text.replace(/(^|[^\w_])_([^_\n]+)_(?=[^\w_]|$)/g, "$1<em>$2</em>");

  text = text.replace(/\u0000LINK_(\d+)\u0000/g, (_m, i) => linkPlaceholders[Number(i)] || "");
  text = text.replace(/\u0000CODE_(\d+)\u0000/g, (_m, i) => codePlaceholders[Number(i)] || "");

  return text;
}

function parseTableRowCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|") && !trimmed.includes("-")) return false;
  const cells = parseTableRowCells(trimmed);
  return cells.length >= 1 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function parseAlignments(separatorLine: string): ("left" | "center" | "right" | null)[] {
  return parseTableRowCells(separatorLine).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

function normalizeLanguageTag(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/^language-/, "");
  if (!cleaned) return "plaintext";
  return cleaned;
}

/**
 * Converts Markdown into clean Tiptap-compatible HTML:
 * supports fenced code blocks, GFM tables, nested checklists, nested bullet/ordered lists,
 * headings (H1-H3), blockquotes, horizontal rules, and inline formatting.
 */
export function markdownToRichHtml(markdown: string): string {
  const normalized = (markdown || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "<p></p>";

  // Extract fenced code blocks into placeholders first
  const fencePlaceholders: string[] = [];
  const withoutFences = normalized.replace(
    /```([a-zA-Z0-9_+#.-]*)\n([\s\S]*?)```/g,
    (_m, lang, code) => {
      const safeLang = normalizeLanguageTag(lang || "plaintext");
      const trimmedCode = code.replace(/\n$/, "");
      const html = `<pre data-language="${escapeHtml(safeLang)}"><code class="language-${escapeHtml(safeLang)}">${escapeHtml(trimmedCode)}</code></pre>`;
      const idx = fencePlaceholders.length;
      fencePlaceholders.push(html);
      return `\n\u0000FENCE_${idx}\u0000\n`;
    },
  );

  const lines = withoutFences.split("\n");
  const blocks: string[] = [];
  let idx = 0;

  const isBlockStart = (line: string, nextLine?: string): boolean => {
    const t = line.trim();
    if (!t) return true;
    if (/^\u0000FENCE_\d+\u0000$/.test(t)) return true;
    if (/^#{1,6}\s+/.test(t)) return true;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) return true;
    if (/^>\s?/.test(t)) return true;
    if (/^\s*([-*+])\s+\[[ xX]\]\s+/.test(line)) return true;
    if (/^\s*[-*+]\s+/.test(line)) return true;
    if (/^\s*\d+[.)]\s+/.test(line)) return true;
    if (line.includes("|") && nextLine && isTableSeparatorLine(nextLine)) return true;
    return false;
  };

  while (idx < lines.length) {
    const line = lines[idx];
    const trimmed = line.trim();

    if (!trimmed) {
      idx++;
      continue;
    }

    const fenceMatch = trimmed.match(/^\u0000FENCE_(\d+)\u0000$/);
    if (fenceMatch) {
      blocks.push(fencePlaceholders[Number(fenceMatch[1])] || "");
      idx++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push("<hr>");
      idx++;
      continue;
    }

    // Headings
    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = Math.min(3, Math.max(1, hMatch[1].length));
      blocks.push(`<h${level}>${renderInlineMarkdown(hMatch[2].trim())}</h${level}>`);
      idx++;
      continue;
    }

    // GFM Table
    if (
      line.includes("|") &&
      idx + 1 < lines.length &&
      isTableSeparatorLine(lines[idx + 1])
    ) {
      const headerCells = parseTableRowCells(line);
      const alignments = parseAlignments(lines[idx + 1]);
      idx += 2;
      const bodyRows: string[][] = [];
      while (idx < lines.length && lines[idx].trim() && lines[idx].includes("|")) {
        bodyRows.push(parseTableRowCells(lines[idx]));
        idx++;
      }
      const colCount = Math.max(
        headerCells.length,
        ...bodyRows.map((r) => r.length),
      );
      const theadHtml =
        "<tr>" +
        Array.from({ length: colCount }, (_, c) => {
          const align = alignments[c];
          const styleAttr = align ? ` style="text-align: ${align}"` : "";
          return `<th${styleAttr}><p>${renderInlineMarkdown(headerCells[c] || "")}</p></th>`;
        }).join("") +
        "</tr>";
      const tbodyHtml = bodyRows
        .map(
          (row) =>
            "<tr>" +
            Array.from({ length: colCount }, (_, c) => {
              const align = alignments[c];
              const styleAttr = align ? ` style="text-align: ${align}"` : "";
              return `<td${styleAttr}><p>${renderInlineMarkdown(row[c] || "")}</p></td>`;
            }).join("") +
            "</tr>",
        )
        .join("");
      blocks.push(`<table><tbody>${theadHtml}${tbodyHtml}</tbody></table>`);
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (idx < lines.length && /^>\s?/.test(lines[idx].trim())) {
        quoteLines.push(lines[idx].trim().replace(/^>\s?/, ""));
        idx++;
      }
      blocks.push(
        `<blockquote><p>${quoteLines.map(renderInlineMarkdown).join("<br>")}</p></blockquote>`,
      );
      continue;
    }

    // Task list / Bullet list / Ordered list (supports 2-level nesting cleanly)
    const parseListBlock = (startIdx: number): { html: string; nextIdx: number } => {
      const first = lines[startIdx];
      const baseIndent = first.match(/^(\s*)/)?.[1].length ?? 0;
      const isTask = /^\s*[-*+]\s+\[[ xX]\]\s+/.test(first);
      const isOrdered = /^\s*\d+[.)]\s+/.test(first);
      const tag = isOrdered ? "ol" : "ul";
      const itemsHtml: string[] = [];
      let cur = startIdx;

      while (cur < lines.length) {
        const currentLine = lines[cur];
        if (!currentLine.trim()) break;
        const indent = currentLine.match(/^(\s*)/)?.[1].length ?? 0;
        if (indent < baseIndent) break;

        if (indent > baseIndent) {
          // Nested sub-list attaches to previous <li>
          if (
            /^\s*([-*+]|\d+[.)])\s+/.test(currentLine) &&
            itemsHtml.length > 0
          ) {
            const sub = parseListBlock(cur);
            const last = itemsHtml.pop()!;
            itemsHtml.push(last.replace(/<\/li>$/, `${sub.html}</li>`));
            cur = sub.nextIdx;
            continue;
          }
          break;
        }

        const taskMatch = currentLine.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
        const bulletMatch = currentLine.match(/^\s*[-*+]\s+(.*)$/);
        const orderedMatch = currentLine.match(/^\s*\d+[.)]\s+(.*)$/);

        if (isTask && taskMatch) {
          const checked = taskMatch[1].toLowerCase() === "x";
          itemsHtml.push(
            `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"${checked ? " checked" : ""}></label><div><p>${renderInlineMarkdown(taskMatch[2])}</p></div></li>`,
          );
          cur++;
        } else if (!isTask && !isOrdered && bulletMatch && !taskMatch) {
          itemsHtml.push(`<li><p>${renderInlineMarkdown(bulletMatch[1])}</p></li>`);
          cur++;
        } else if (isOrdered && orderedMatch) {
          itemsHtml.push(`<li><p>${renderInlineMarkdown(orderedMatch[1])}</p></li>`);
          cur++;
        } else {
          break;
        }
      }

      const listAttr = isTask ? ' data-type="taskList"' : "";
      return {
        html: `<${tag}${listAttr}>${itemsHtml.join("")}</${tag}>`,
        nextIdx: cur,
      };
    };

    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const res = parseListBlock(idx);
      blocks.push(res.html);
      idx = res.nextIdx;
      continue;
    }

    // Paragraph (join contiguous non-block lines)
    const paraLines: string[] = [];
    while (
      idx < lines.length &&
      lines[idx].trim() &&
      !isBlockStart(lines[idx], lines[idx + 1])
    ) {
      paraLines.push(lines[idx].trim());
      idx++;
    }
    if (paraLines.length > 0) {
      blocks.push(`<p>${paraLines.map(renderInlineMarkdown).join("<br>")}</p>`);
    } else {
      blocks.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
      idx++;
    }
  }

  return blocks.join("") || "<p></p>";
}

/**
 * Clean HTML -> plain text for search indexing & prompt snippet generation.
 */
export function stripHtmlToPlainText(html: string): string {
  if (!html) return "";
  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
    } catch {
      // fallback
    }
  }
  return unescapeHtml(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function richHtmlHasCode(html: string): boolean {
  return /<pre\b/i.test(html) || /<code\b/i.test(html);
}

/**
 * Converts stored Tiptap HTML back into clean portable Markdown for export.
 */
export function richHtmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return stripHtmlToPlainText(html);
  }

  const doc = new DOMParser().parseFromString(html, "text/html");

  const inline = (el: Node): string => {
    if (el.nodeType === Node.TEXT_NODE) return el.textContent || "";
    if (el.nodeType !== Node.ELEMENT_NODE) return "";
    const node = el as HTMLElement;
    const tag = node.tagName.toLowerCase();
    const inner = Array.from(node.childNodes).map(inline).join("");
    if (tag === "strong" || tag === "b") return `**${inner}**`;
    if (tag === "em" || tag === "i") return `*${inner}*`;
    if (tag === "s" || tag === "del" || tag === "strike") return `~~${inner}~~`;
    if (tag === "code" && node.parentElement?.tagName.toLowerCase() !== "pre") {
      return `\`${node.textContent || ""}\``;
    }
    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      return href ? `[${inner}](${href})` : inner;
    }
    if (tag === "br") return "\n";
    return inner;
  };

  const block = (node: Node, listDepth = 0): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").trim();
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "h1") return `# ${inline(el).trim()}\n`;
    if (tag === "h2") return `## ${inline(el).trim()}\n`;
    if (tag === "h3") return `### ${inline(el).trim()}\n`;
    if (tag === "hr") return "---\n";
    if (tag === "pre") {
      const lang =
        el.getAttribute("data-language") ||
        el.querySelector("code")?.className.replace(/^.*language-/, "") ||
        "";
      const cleanLang = lang === "plaintext" ? "" : lang;
      const code = (el.textContent || "").replace(/\n$/, "");
      return `\`\`\`${cleanLang}\n${code}\n\`\`\`\n`;
    }
    if (tag === "blockquote") {
      const content = Array.from(el.childNodes)
        .map((c) => block(c, listDepth))
        .join("\n")
        .trim();
      return (
        content
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n") + "\n"
      );
    }
    if (tag === "ul" || tag === "ol") {
      const isTask = el.getAttribute("data-type") === "taskList";
      const items = Array.from(el.children).filter(
        (c) => c.tagName.toLowerCase() === "li",
      );
      return (
        items
          .map((li, idx) => {
            const pad = "  ".repeat(listDepth);
            const checked = li.getAttribute("data-checked") === "true";
            const prefix = isTask
              ? `- [${checked ? "x" : " "}] `
              : tag === "ol"
                ? `${idx + 1}. `
                : "- ";
            const parts: string[] = [];
            const subLists: string[] = [];
            Array.from(li.children).forEach((child) => {
              const cTag = child.tagName.toLowerCase();
              if (cTag === "ul" || cTag === "ol") {
                subLists.push(block(child, listDepth + 1).trimEnd());
              } else if (cTag === "label") {
                // Skip taskList checkbox label
              } else if (cTag === "div") {
                Array.from(child.children).forEach((grand) => {
                  const gTag = grand.tagName.toLowerCase();
                  if (gTag === "ul" || gTag === "ol") {
                    subLists.push(block(grand, listDepth + 1).trimEnd());
                  } else {
                    parts.push(inline(grand).trim());
                  }
                });
              } else {
                parts.push(inline(child).trim());
              }
            });
            const headLine = `${pad}${prefix}${parts.join(" ").trim()}`;
            return subLists.length > 0 ? `${headLine}\n${subLists.join("\n")}` : headLine;
          })
          .join("\n") + "\n"
      );
    }
    if (tag === "table") {
      const rows = Array.from(el.querySelectorAll("tr"));
      if (rows.length === 0) return "";
      const matrix = rows.map((tr) =>
        Array.from(tr.children).map((cell) =>
          (cell.textContent || "").replace(/\s+/g, " ").trim().replace(/\|/g, "\\|"),
        ),
      );
      const colCount = Math.max(...matrix.map((r) => r.length), 1);
      const padRow = (r: string[]) =>
        "| " + Array.from({ length: colCount }, (_, i) => r[i] || "").join(" | ") + " |";
      const sep = "| " + Array.from({ length: colCount }, () => "---").join(" | ") + " |";
      return [padRow(matrix[0]), sep, ...matrix.slice(1).map(padRow)].join("\n") + "\n";
    }
    if (tag === "p") {
      const txt = inline(el).trim();
      return txt ? `${txt}\n` : "";
    }
    return Array.from(el.childNodes)
      .map((c) => block(c, listDepth))
      .join("\n");
  };

  return Array.from(doc.body.childNodes)
    .map((n) => block(n))
    .filter((s) => s.trim().length > 0)
    .join("\n")
    .trim();
}

/**
 * Extracts <thinking> / <think> / "Thought for Xs" blocks and trailing Sources/Citations lists.
 */
export function extractThinkingAndSources(rawText: string): {
  cleanedText: string;
  thinkingText?: string;
  sources: AiTurnSource[];
} {
  let working = (rawText || "").replace(/\r\n?/g, "\n").trim();
  const thinkingParts: string[] = [];

  // <thinking>...</thinking> or <think>...</think>
  working = working.replace(
    /<(thinking|think)>([\s\S]*?)<\/\1>/gi,
    (_m, _tag, inner) => {
      const trimmed = String(inner || "").trim();
      if (trimmed) thinkingParts.push(trimmed);
      return "";
    },
  );

  // Leading "Thought for X seconds" / "Thinking Process:" block separated by double newline or divider
  const thoughtLeadMatch = working.match(
    /^(?:Thought for [^\n]+|Thinking Process:?|Show thinking)\n+([\s\S]*?)(?:\n{2,}|^---\s*$)/im,
  );
  if (thoughtLeadMatch && thoughtLeadMatch[1].trim().length > 10) {
    thinkingParts.push(thoughtLeadMatch[1].trim());
    working = working.slice(thoughtLeadMatch[0].length).trim();
  }

  // Trailing Sources / Citations / References section
  const sources: AiTurnSource[] = [];
  const sourcesHeaderMatch = working.match(
    /\n{1,2}(?:#{1,4}\s*|\*\*)?(?:Sources|Citations|References)(?:\*\*)?:?\s*\n+([\s\S]+)$/i,
  );
  if (sourcesHeaderMatch) {
    const tail = sourcesHeaderMatch[1].trim();
    const lines = tail.split("\n").map((l) => l.trim()).filter(Boolean);
    const looksLikeSources =
      lines.length > 0 &&
      lines.every(
        (l) =>
          /^[-*\d.)\[]/.test(l) ||
          /https?:\/\//.test(l),
      );
    if (looksLikeSources) {
      for (const line of lines) {
        const mdLink = line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
        const urlOnly = line.match(/(https?:\/\/[^\s)]+)/);
        if (mdLink) {
          sources.push({
            id: makeUid("src"),
            title: mdLink[1].trim(),
            url: mdLink[2].trim(),
          });
        } else if (urlOnly) {
          const cleanTitle = line
            .replace(urlOnly[1], "")
            .replace(/^[-*\d.)\[\]]+\s*/, "")
            .replace(/[—–:-]\s*$/, "")
            .trim();
          sources.push({
            id: makeUid("src"),
            title: cleanTitle || urlOnly[1],
            url: urlOnly[1],
          });
        } else {
          const text = line.replace(/^[-*\d.)]+\s*/, "").trim();
          if (text) {
            sources.push({ id: makeUid("src"), title: text });
          }
        }
      }
      working = working.slice(0, sourcesHeaderMatch.index).trim();
    }
  }

  return {
    cleanedText: working,
    thinkingText: thinkingParts.length > 0 ? thinkingParts.join("\n\n") : undefined,
    sources,
  };
}

export interface ParsedDraftTurn {
  id: string;
  role: AiTurnRole;
  rawText: string;
  contentHtml: string;
  thinkingText?: string;
  sources: AiTurnSource[];
  collapsed: boolean;
}

export interface ParsedTranscriptResult {
  detectedPlatform: AiPlatform;
  suggestedModel: string;
  suggestedTitle: string;
  sourceUrl: string;
  turns: ParsedDraftTurn[];
}

function detectPlatformFromMarkers(raw: string): {
  platform: AiPlatform;
  model: string;
} {
  const lower = raw.toLowerCase();
  if (/\bchatgpt said:/i.test(raw) || /chat\.openai\.com|chatgpt\.com/i.test(lower)) {
    return { platform: "chatgpt", model: "GPT-4o" };
  }
  if (/\bclaude said:|claude\.ai|anthropic/i.test(lower) || /<thinking>/i.test(raw)) {
    return { platform: "claude", model: "Claude 3.7 Sonnet" };
  }
  if (/\bgemini said:|gemini\.google\.com|aistudio\.google\.com/i.test(lower)) {
    return { platform: "gemini", model: "Gemini 2.5 Pro" };
  }
  if (/perplexity\.ai|\bperplexity\b/i.test(lower)) {
    return { platform: "perplexity", model: "Sonar Pro" };
  }
  if (/<think>/i.test(raw) || /\bdeepseek\b/i.test(lower)) {
    return { platform: "deepseek", model: "DeepSeek-R1" };
  }
  if (/\bgrok\b|x\.com\/i\/grok/i.test(lower)) {
    return { platform: "grok", model: "Grok 3" };
  }
  return { platform: "other", model: "" };
}

function buildParsedTurn(
  role: AiTurnRole,
  rawBody: string,
  autoCollapseLongPrompts: boolean,
): ParsedDraftTurn {
  const { cleanedText, thinkingText, sources } =
    role === "assistant"
      ? extractThinkingAndSources(rawBody)
      : { cleanedText: rawBody.trim(), thinkingText: undefined, sources: [] };
  const lineCount = cleanedText.split("\n").length;
  return {
    id: makeUid("turn"),
    role,
    rawText: cleanedText,
    contentHtml: markdownToRichHtml(cleanedText),
    thinkingText,
    sources,
    collapsed: autoCollapseLongPrompts && role === "user" && lineCount > 8,
  };
}

/**
 * Multi-format transcript parser supporting pasted web chats from ChatGPT, Claude, Gemini,
 * Perplexity, DeepSeek, Grok, Markdown role headings, and optional custom delimiter splitting.
 */
export function parseConversationTranscript(
  rawInput: string,
  options?: {
    customDelimiter?: string;
    autoCollapseLongPrompts?: boolean;
  },
): ParsedTranscriptResult {
  const normalized = (rawInput || "").replace(/\r\n?/g, "\n").trim();
  const autoCollapse = Boolean(options?.autoCollapseLongPrompts);
  const { platform: detectedPlatform, model: suggestedModel } =
    detectPlatformFromMarkers(normalized);

  const urlMatch = normalized.match(
    /https?:\/\/(?:chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|perplexity\.ai|chat\.deepseek\.com|grok\.com)[^\s)]+/i,
  );
  const sourceUrl = urlMatch?.[0] || "";

  if (!normalized) {
    return {
      detectedPlatform,
      suggestedModel,
      suggestedTitle: "",
      sourceUrl,
      turns: [],
    };
  }

  // 1) Custom delimiter mode if user provided one
  const customDelimiter = options?.customDelimiter?.trim();
  if (customDelimiter) {
    const escaped = customDelimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const splitter = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*(?:\\n|$)`, "g");
    const chunks = normalized
      .split(splitter)
      .map((s) => s.trim())
      .filter(Boolean);
    const turns = chunks.map((chunk, idx) =>
      buildParsedTurn(idx % 2 === 0 ? "user" : "assistant", chunk, autoCollapse),
    );
    const firstUser = turns.find((t) => t.role === "user");
    return {
      detectedPlatform,
      suggestedModel,
      suggestedTitle: suggestTitleFromText(firstUser?.rawText || turns[0]?.rawText || ""),
      sourceUrl,
      turns,
    };
  }

  // 2) Standard web-chat & markdown role marker detection (ignoring fenced code blocks)
  const lines = normalized.split("\n");
  const segments: { role: AiTurnRole; lines: string[] }[] = [];
  let inFence = false;

  const matchRoleHeader = (
    line: string,
  ): { role: AiTurnRole; remainder: string } | null => {
    const t = line.trim();
    if (!t) return null;

    // Exact standalone role lines commonly copied from ChatGPT / Claude / Gemini web UIs
    if (
      /^(?:You said|You|User|Human|Me|Prompt)\s*:?\s*$/i.test(t) ||
      /^(?:#{1,4}\s*|\*{2}|>\s*)(?:You said|You|User|Human|Me|Prompt)\*{0,2}:?\s*$/i.test(t)
    ) {
      return { role: "user", remainder: "" };
    }
    if (
      /^(?:ChatGPT said|ChatGPT|Claude said|Claude|Gemini said|Gemini|Assistant|Model|DeepSeek|Grok|Perplexity|AI)\s*:?\s*$/i.test(
        t,
      ) ||
      /^(?:#{1,4}\s*|\*{2}|>\s*)(?:ChatGPT said|ChatGPT|Claude said|Claude|Gemini said|Gemini|Assistant|Model|DeepSeek|Grok|Perplexity|AI)\*{0,2}:?\s*$/i.test(
        t,
      )
    ) {
      return { role: "assistant", remainder: "" };
    }
    if (/^(?:#{1,4}\s*|\*{2})?(?:Personal Note|Note|My Note)\*{0,2}:\s*(.*)$/i.test(t)) {
      const m = t.match(/^(?:#{1,4}\s*|\*{2})?(?:Personal Note|Note|My Note)\*{0,2}:\s*(.*)$/i);
      return { role: "note", remainder: m?.[1] || "" };
    }

    // Inline prefix "User: ..." or "**Assistant:** ..."
    const inlineUser = t.match(
      /^(?:\*{2})?(?:You said|User|Human|Prompt)(?:\*{2})?:\s+(.+)$/i,
    );
    if (inlineUser) {
      return { role: "user", remainder: inlineUser[1] };
    }
    const inlineAssistant = t.match(
      /^(?:\*{2})?(?:ChatGPT said|ChatGPT|Claude said|Claude|Gemini said|Gemini|Assistant|Model|DeepSeek|Grok|Perplexity)(?:\*{2})?:\s+(.+)$/i,
    );
    if (inlineAssistant) {
      return { role: "assistant", remainder: inlineAssistant[1] };
    }

    return null;
  };

  let current: { role: AiTurnRole; lines: string[] } | null = null;
  const preambleLines: string[] = [];

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
    }

    if (!inFence) {
      const detected = matchRoleHeader(line);
      if (detected) {
        if (current) {
          segments.push(current);
        } else if (preambleLines.some((l) => l.trim().length > 0)) {
          segments.push({ role: "user", lines: [...preambleLines] });
          preambleLines.length = 0;
        }
        current = {
          role: detected.role,
          lines: detected.remainder ? [detected.remainder] : [],
        };
        continue;
      }
    }

    if (current) {
      current.lines.push(line);
    } else {
      preambleLines.push(line);
    }
  }

  if (current) {
    segments.push(current);
  }

  let turns: ParsedDraftTurn[] = [];

  if (segments.length > 0) {
    turns = segments
      .map((seg) => buildParsedTurn(seg.role, seg.lines.join("\n"), autoCollapse))
      .filter((t) => t.rawText.length > 0 || Boolean(t.thinkingText) || t.sources.length > 0);
  } else {
    // 3) Fallback: check if horizontal rules `---` cleanly split multi-block pastes
    const hrChunks = normalized
      .split(/\n\s*---+\s*\n/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (hrChunks.length >= 2) {
      turns = hrChunks.map((chunk, idx) =>
        buildParsedTurn(idx % 2 === 0 ? "user" : "assistant", chunk, autoCollapse),
      );
    } else {
      // Single pasted AI response or prompt
      const looksLikeReply =
        normalized.includes("```") ||
        /^#{1,3}\s+/m.test(normalized) ||
        normalized.length > 420;
      turns = [
        buildParsedTurn(looksLikeReply ? "assistant" : "user", normalized, autoCollapse),
      ];
    }
  }

  const firstUser = turns.find((t) => t.role === "user");
  const titleSource = firstUser?.rawText || turns[0]?.rawText || "";

  return {
    detectedPlatform,
    suggestedModel,
    suggestedTitle: suggestTitleFromText(titleSource),
    sourceUrl,
    turns,
  };
}

function suggestTitleFromText(raw: string): string {
  const firstLine = (raw || "")
    .replace(/^#+\s*/, "")
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!firstLine) return "";
  const cleaned = firstLine.replace(/[*_`[\]]/g, "").trim();
  return cleaned.length > 72 ? `${cleaned.slice(0, 69).trim()}...` : cleaned;
}

export interface ImportedVendorConversation {
  tempId: string;
  title: string;
  platform: AiPlatform;
  model: string;
  chatDate: string | null;
  topic: string;
  tags: string[];
  sourceUrl: string;
  turns: ParsedDraftTurn[];
  annotations?: AiMarginAnnotation[];
}

/**
 * Parses uploaded .json files from ChatGPT (conversations.json), Claude exports,
 * Gemini/Generic JSON, or Kanso AI Vault native backups.
 */
export function parseVendorJsonExport(jsonText: string): ImportedVendorConversation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }

  // 1) Kanso AI Vault native backup format
  if (
    parsed &&
    typeof parsed === "object" &&
    (parsed as { format?: string }).format === "kanso-ai-vault-v1" &&
    Array.isArray((parsed as { items?: unknown[] }).items)
  ) {
    const items = (parsed as { items: Array<{ meta: AiChatRecord; body?: AiChatBodyRecord }> }).items;
    return items.map((item) => ({
      tempId: item.meta.id || makeUid("imp"),
      title: item.meta.title || "Imported AI Chat",
      platform: item.meta.platform || "other",
      model: item.meta.model || "",
      chatDate: item.meta.chatDate || null,
      topic: item.meta.topic || "",
      tags: Array.isArray(item.meta.tags) ? item.meta.tags : [],
      sourceUrl: item.meta.sourceUrl || "",
      turns: (item.body?.turns || []).map((t) => ({
        id: t.id || makeUid("turn"),
        role: t.role,
        rawText: stripHtmlToPlainText(t.contentHtml),
        contentHtml: t.contentHtml,
        thinkingText: t.thinkingText,
        sources: t.sources || [],
        collapsed: Boolean(t.collapsed),
      })),
      annotations: item.body?.annotations || [],
    }));
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { conversations?: unknown[] }).conversations)
      ? (parsed as { conversations: unknown[] }).conversations
      : [parsed];

  const results: ImportedVendorConversation[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;

    // 2) ChatGPT conversations.json (with mapping tree)
    if (obj.mapping && typeof obj.mapping === "object") {
      type ChatGptMappingNode = {
        id?: string;
        parent?: string | null;
        children?: string[];
        message?: {
          author?: { role?: string };
          content?: { parts?: unknown[]; text?: string };
          metadata?: { model_slug?: string };
          create_time?: number;
        } | null;
      };
      const mapping = obj.mapping as Record<string, ChatGptMappingNode>;
      const chain: Array<{ role: AiTurnRole; text: string; model?: string }> = [];
      let cursor: string | null | undefined =
        typeof obj.current_node === "string" ? obj.current_node : null;

      if (cursor && mapping[cursor]) {
        const reversed: typeof chain = [];
        const guard = new Set<string>();
        while (cursor && mapping[cursor] && !guard.has(cursor)) {
          guard.add(cursor);
          const node: ChatGptMappingNode = mapping[cursor];
          const msg = node.message;
          const authorRole = msg?.author?.role;
          if (authorRole === "user" || authorRole === "assistant") {
            const parts = Array.isArray(msg?.content?.parts)
              ? msg.content!.parts
                  .filter((p: unknown): p is string => typeof p === "string")
                  .join("\n")
              : typeof msg?.content?.text === "string"
                ? msg.content.text
                : "";
            if (parts.trim()) {
              reversed.push({
                role: authorRole,
                text: parts.trim(),
                model: msg?.metadata?.model_slug,
              });
            }
          }
          cursor = node.parent;
        }
        chain.push(...reversed.reverse());
      } else {
        // Fallback DFS traversal in child order
        Object.values(mapping).forEach((node) => {
          const msg = node.message;
          const authorRole = msg?.author?.role;
          if (authorRole === "user" || authorRole === "assistant") {
            const parts = Array.isArray(msg?.content?.parts)
              ? msg.content!.parts
                  .filter((p): p is string => typeof p === "string")
                  .join("\n")
              : "";
            if (parts.trim()) {
              chain.push({
                role: authorRole,
                text: parts.trim(),
                model: msg?.metadata?.model_slug,
              });
            }
          }
        });
      }

      if (chain.length > 0) {
        const createTime =
          typeof obj.create_time === "number"
            ? new Date(obj.create_time * 1000).toISOString().slice(0, 10)
            : null;
        const foundModel = chain.find((c) => c.model)?.model || "GPT-4o";
        results.push({
          tempId: makeUid("cgpt"),
          title:
            (typeof obj.title === "string" && obj.title.trim()) ||
            suggestTitleFromText(chain[0].text) ||
            "ChatGPT Conversation",
          platform: "chatgpt",
          model: foundModel,
          chatDate: createTime,
          topic: "",
          tags: [],
          sourceUrl:
            typeof obj.conversation_id === "string"
              ? `https://chatgpt.com/c/${obj.conversation_id}`
              : "",
          turns: chain.map((c) => buildParsedTurn(c.role, c.text, false)),
        });
      }
      continue;
    }

    // 3) Claude JSON export (`chat_messages`)
    if (Array.isArray(obj.chat_messages)) {
      const turns: ParsedDraftTurn[] = [];
      for (const rawMsg of obj.chat_messages) {
        if (!rawMsg || typeof rawMsg !== "object") continue;
        const msg = rawMsg as Record<string, unknown>;
        const sender = String(msg.sender || msg.role || "").toLowerCase();
        const role: AiTurnRole =
          sender === "human" || sender === "user" ? "user" : "assistant";
        let text = typeof msg.text === "string" ? msg.text : "";
        let thinking = "";
        if (!text && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (!block || typeof block !== "object") continue;
            const b = block as Record<string, unknown>;
            if (b.type === "thinking" && typeof b.thinking === "string") {
              thinking += (thinking ? "\n\n" : "") + b.thinking;
            } else if (typeof b.text === "string") {
              text += (text ? "\n\n" : "") + b.text;
            }
          }
        }
        if (text.trim() || thinking.trim()) {
          const parsedTurn = buildParsedTurn(role, text, false);
          if (thinking.trim() && !parsedTurn.thinkingText) {
            parsedTurn.thinkingText = thinking.trim();
          }
          turns.push(parsedTurn);
        }
      }
      if (turns.length > 0) {
        results.push({
          tempId: makeUid("claude"),
          title:
            (typeof obj.name === "string" && obj.name.trim()) ||
            (typeof obj.title === "string" && obj.title.trim()) ||
            suggestTitleFromText(turns[0].rawText) ||
            "Claude Conversation",
          platform: "claude",
          model:
            typeof obj.model === "string" && obj.model ? obj.model : "Claude 3.7 Sonnet",
          chatDate:
            typeof obj.created_at === "string" ? obj.created_at.slice(0, 10) : null,
          topic: "",
          tags: [],
          sourceUrl:
            typeof obj.uuid === "string" ? `https://claude.ai/chat/${obj.uuid}` : "",
          turns,
        });
      }
      continue;
    }

    // 4) Generic / Gemini JSON (`messages` or `turns` or `chunkedPrompt.chunks`)
    const rawArray = Array.isArray(obj.messages)
      ? obj.messages
      : Array.isArray(obj.turns)
        ? obj.turns
        : obj.chunkedPrompt &&
            typeof obj.chunkedPrompt === "object" &&
            Array.isArray((obj.chunkedPrompt as { chunks?: unknown[] }).chunks)
          ? (obj.chunkedPrompt as { chunks: unknown[] }).chunks
          : null;

    if (rawArray) {
      const turns: ParsedDraftTurn[] = [];
      for (const rawMsg of rawArray) {
        if (!rawMsg || typeof rawMsg !== "object") continue;
        const msg = rawMsg as Record<string, unknown>;
        const r = String(msg.role || msg.author || msg.sender || "").toLowerCase();
        const role: AiTurnRole =
          r === "user" || r === "human"
            ? "user"
            : r === "note"
              ? "note"
              : "assistant";
        const content =
          typeof msg.text === "string"
            ? msg.text
            : typeof msg.content === "string"
              ? msg.content
              : typeof msg.contentHtml === "string"
                ? stripHtmlToPlainText(msg.contentHtml)
                : "";
        if (!content.trim()) continue;
        const parsedTurn = buildParsedTurn(role, content, false);
        if (typeof msg.contentHtml === "string" && msg.contentHtml.trim()) {
          parsedTurn.contentHtml = msg.contentHtml;
        }
        turns.push(parsedTurn);
      }
      if (turns.length > 0) {
        const platformRaw = String(obj.platform || "").toLowerCase();
        const platform: AiPlatform =
          platformRaw === "gemini" ||
          platformRaw === "chatgpt" ||
          platformRaw === "claude" ||
          platformRaw === "perplexity" ||
          platformRaw === "deepseek" ||
          platformRaw === "grok"
            ? (platformRaw as AiPlatform)
            : obj.chunkedPrompt
              ? "gemini"
              : "other";
        results.push({
          tempId: makeUid("gen"),
          title:
            (typeof obj.title === "string" && obj.title.trim()) ||
            suggestTitleFromText(turns[0].rawText) ||
            "Imported AI Chat",
          platform,
          model: typeof obj.model === "string" ? obj.model : "",
          chatDate:
            typeof obj.chatDate === "string"
              ? obj.chatDate
              : typeof obj.createdAt === "string"
                ? obj.createdAt.slice(0, 10)
                : null,
          topic: typeof obj.topic === "string" ? obj.topic : "",
          tags: Array.isArray(obj.tags)
            ? obj.tags.filter((t): t is string => typeof t === "string")
            : [],
          sourceUrl: typeof obj.sourceUrl === "string" ? obj.sourceUrl : "",
          turns,
        });
      }
    }
  }

  return results;
}

export function buildSearchFieldsForChat(
  turns: AiConversationTurn[],
  annotations: AiMarginAnnotation[],
): {
  searchText: string;
  searchPromptText: string;
  searchReplyText: string;
  hasCode: boolean;
  previewPrompt: string;
} {
  const promptParts: string[] = [];
  const replyParts: string[] = [];
  const allParts: string[] = [];
  let hasCode = false;
  let previewPrompt = "";

  for (const turn of turns) {
    const plain = stripHtmlToPlainText(turn.contentHtml);
    if (richHtmlHasCode(turn.contentHtml)) hasCode = true;
    if (turn.role === "user") {
      if (!previewPrompt && plain) {
        previewPrompt = plain.length > 180 ? `${plain.slice(0, 177).trim()}...` : plain;
      }
      if (plain) promptParts.push(plain);
    } else if (turn.role === "assistant") {
      if (plain) replyParts.push(plain);
      if (turn.thinkingText) replyParts.push(turn.thinkingText);
      if (turn.sources?.length) {
        replyParts.push(
          turn.sources.map((s) => `${s.title} ${s.url || ""}`).join(" "),
        );
      }
    } else if (plain) {
      allParts.push(plain);
    }
  }

  for (const ann of annotations) {
    if (ann.quoteText) allParts.push(ann.quoteText);
    if (ann.comment) allParts.push(ann.comment);
  }

  const searchPromptText = promptParts.join(" ").toLowerCase();
  const searchReplyText = replyParts.join(" ").toLowerCase();
  const searchText = [searchPromptText, searchReplyText, ...allParts.map((p) => p.toLowerCase())]
    .filter(Boolean)
    .join(" ");

  return {
    searchText,
    searchPromptText,
    searchReplyText,
    hasCode,
    previewPrompt,
  };
}

export function exportAiChatToMarkdown(
  meta: AiChatRecord,
  turns: AiConversationTurn[],
  annotations: AiMarginAnnotation[] = [],
): string {
  const lines: string[] = [];
  lines.push(`# ${meta.title || "Untitled AI Chat"}`);
  lines.push("");
  lines.push(`- **Platform**: ${AI_PLATFORM_LABELS[meta.platform] || meta.platform}`);
  if (meta.model) lines.push(`- **Model**: ${meta.model}`);
  if (meta.topic) lines.push(`- **Topic**: ${meta.topic}`);
  if (meta.chatDate) lines.push(`- **Date**: ${meta.chatDate}`);
  if (meta.sourceUrl) lines.push(`- **Source**: ${meta.sourceUrl}`);
  if (meta.tags.length > 0) lines.push(`- **Tags**: ${meta.tags.join(", ")}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  turns.forEach((turn, idx) => {
    const label =
      turn.role === "user"
        ? "User"
        : turn.role === "note"
          ? "Personal Note"
          : meta.model || AI_PLATFORM_LABELS[meta.platform] || "Assistant";
    lines.push(`## ${idx + 1}. ${label}`);
    lines.push("");
    if (turn.thinkingText) {
      lines.push("<thinking>");
      lines.push(turn.thinkingText.trim());
      lines.push("</thinking>");
      lines.push("");
    }
    lines.push(richHtmlToMarkdown(turn.contentHtml));
    if (turn.sources && turn.sources.length > 0) {
      lines.push("");
      lines.push("**Sources:**");
      turn.sources.forEach((src) => {
        lines.push(src.url ? `- [${src.title}](${src.url})` : `- ${src.title}`);
      });
    }
    const turnAnns = annotations.filter((a) => a.turnId === turn.id);
    if (turnAnns.length > 0) {
      lines.push("");
      lines.push("**Annotations:**");
      turnAnns.forEach((ann) => {
        lines.push(`> "${ann.quoteText}" — ${ann.comment}`);
      });
    }
    lines.push("");
  });

  return lines.join("\n").trim() + "\n";
}
