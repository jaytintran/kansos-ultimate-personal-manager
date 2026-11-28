import type {
  AiChatFolder,
  AiMarginAnnotationColor,
  AiPlatform,
} from "../../types/aiVault";

export interface PlatformDisplayInfo {
  id: AiPlatform;
  label: string;
  shortLabel: string;
  dotColor: string;
}

export const AI_PLATFORM_LIST: PlatformDisplayInfo[] = [
  { id: "chatgpt", label: "ChatGPT", shortLabel: "GPT", dotColor: "#10a37f" },
  { id: "claude", label: "Claude", shortLabel: "Claude", dotColor: "#d97706" },
  { id: "gemini", label: "Gemini", shortLabel: "Gemini", dotColor: "#3b82f6" },
  {
    id: "perplexity",
    label: "Perplexity",
    shortLabel: "Pplx",
    dotColor: "#06b6d4",
  },
  { id: "deepseek", label: "DeepSeek", shortLabel: "DS", dotColor: "#6366f1" },
  { id: "grok", label: "Grok", shortLabel: "Grok", dotColor: "#71717a" },
  { id: "other", label: "Other AI", shortLabel: "AI", dotColor: "#8b5cf6" },
];

export const AI_PLATFORM_META: Record<AiPlatform, PlatformDisplayInfo> =
  Object.fromEntries(
    AI_PLATFORM_LIST.map((item) => [item.id, item]),
  ) as Record<AiPlatform, PlatformDisplayInfo>;

export const HIGHLIGHT_COLORS: Array<{
  id: AiMarginAnnotationColor;
  label: string;
  swatch: string;
}> = [
  { id: "amber", label: "Amber", swatch: "#f59e0b" },
  { id: "sage", label: "Sage", swatch: "#10b981" },
  { id: "sky", label: "Sky", swatch: "#3b82f6" },
  { id: "rose", label: "Rose", swatch: "#f43f5e" },
];

export function formatAiChatDate(raw?: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return trimmed;
  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getAiFolderDescendantIds(
  folders: AiChatFolder[],
  rootId: string,
): Set<string> {
  const result = new Set<string>([rootId]);
  const childrenByParent = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parentId) continue;
    const list = childrenByParent.get(f.parentId) || [];
    list.push(f.id);
    childrenByParent.set(f.parentId, list);
  }
  const stack = [rootId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const kids = childrenByParent.get(cur) || [];
    for (const k of kids) {
      if (!result.has(k)) {
        result.add(k);
        stack.push(k);
      }
    }
  }
  return result;
}

export function getAiFolderBreadcrumb(
  folders: AiChatFolder[],
  folderId: string | null,
): AiChatFolder[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: AiChatFolder[] = [];
  const visited = new Set<string>();
  let cur = byId.get(folderId);
  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

/**
 * Wraps the first un-annotated occurrence of `quoteText` inside `html` with a `<mark>`
 * pointing at `annotationId`, preserving surrounding inline HTML safely.
 */
export function wrapQuoteInHtmlWithMark(
  html: string,
  quoteText: string,
  annotationId: string,
  color: AiMarginAnnotationColor,
): string {
  const needle = quoteText.trim();
  if (!html || !needle || typeof DOMParser === "undefined") return html;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const candidates: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      if (
        current.nodeType === Node.TEXT_NODE &&
        current.parentElement &&
        !current.parentElement.closest("pre, code, mark[data-annotation-id]")
      ) {
        candidates.push(current as Text);
      }
      current = walker.nextNode();
    }

    // Try exact match inside single text node first
    for (const textNode of candidates) {
      const value = textNode.nodeValue || "";
      const idx = value.indexOf(needle);
      if (idx !== -1) {
        const before = value.slice(0, idx);
        const match = value.slice(idx, idx + needle.length);
        const after = value.slice(idx + needle.length);
        const frag = doc.createDocumentFragment();
        if (before) frag.appendChild(doc.createTextNode(before));
        const mark = doc.createElement("mark");
        mark.setAttribute("data-annotation-id", annotationId);
        mark.setAttribute("data-highlight-color", color);
        mark.textContent = match;
        frag.appendChild(mark);
        if (after) frag.appendChild(doc.createTextNode(after));
        textNode.parentNode?.replaceChild(frag, textNode);
        return doc.body.innerHTML;
      }
    }

    // Fallback: match case-insensitively on normalized whitespace inside a text node
    const lowerNeedle = needle.replace(/\s+/g, " ").toLowerCase();
    for (const textNode of candidates) {
      const value = textNode.nodeValue || "";
      const idx = value.toLowerCase().indexOf(lowerNeedle);
      if (idx !== -1) {
        const before = value.slice(0, idx);
        const match = value.slice(idx, idx + lowerNeedle.length);
        const after = value.slice(idx + lowerNeedle.length);
        const frag = doc.createDocumentFragment();
        if (before) frag.appendChild(doc.createTextNode(before));
        const mark = doc.createElement("mark");
        mark.setAttribute("data-annotation-id", annotationId);
        mark.setAttribute("data-highlight-color", color);
        mark.textContent = match;
        frag.appendChild(mark);
        if (after) frag.appendChild(doc.createTextNode(after));
        textNode.parentNode?.replaceChild(frag, textNode);
        return doc.body.innerHTML;
      }
    }
  } catch {
    return html;
  }
  return html;
}

export function updateAnnotationColorInHtml(
  html: string,
  annotationId: string,
  color: AiMarginAnnotationColor,
): string {
  if (!html || typeof DOMParser === "undefined") return html;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const marks = doc.querySelectorAll(`mark[data-annotation-id="${annotationId}"]`);
    if (marks.length === 0) return html;
    marks.forEach((m) => m.setAttribute("data-highlight-color", color));
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

export function removeAnnotationMarkFromHtml(
  html: string,
  annotationId: string,
): string {
  if (!html || typeof DOMParser === "undefined") return html;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const marks = doc.querySelectorAll(`mark[data-annotation-id="${annotationId}"]`);
    if (marks.length === 0) return html;
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    });
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}
