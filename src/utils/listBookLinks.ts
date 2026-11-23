import { useEffect, useState } from "react";
import type { BookNoteLink } from "../types";

/**
 * Local-only storage for links between Books-list items and Library books.
 * Intentionally excluded from `viewPreferences.ts` and GitHub Gist sync
 * because ebook/PDF Library collections exist uniquely per device.
 */
const LIST_ITEM_BOOK_LINKS_KEY = "kanso_list_item_book_links_v1";
const LIST_BOOK_LINKS_EVENT = "kanso:list-book-links-changed";

export function loadAllListItemBookLinks(): Record<string, BookNoteLink> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(LIST_ITEM_BOOK_LINKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, BookNoteLink>;
    }
  } catch {
    // Ignore storage parse failures
  }
  return {};
}

function saveAllListItemBookLinks(map: Record<string, BookNoteLink>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LIST_ITEM_BOOK_LINKS_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota errors
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LIST_BOOK_LINKS_EVENT));
  }
}

export function getListItemBookLink(itemId: string): BookNoteLink | null {
  const all = loadAllListItemBookLinks();
  return all[itemId] ?? null;
}

export function setListItemBookLink(
  itemId: string,
  link: BookNoteLink | null,
): void {
  const all = loadAllListItemBookLinks();
  if (link) {
    all[itemId] = link;
  } else {
    delete all[itemId];
  }
  saveAllListItemBookLinks(all);
}

export function removeListItemBookLinks(itemIds: string[]): void {
  if (itemIds.length === 0) return;
  const all = loadAllListItemBookLinks();
  let changed = false;
  for (const id of itemIds) {
    if (id in all) {
      delete all[id];
      changed = true;
    }
  }
  if (changed) {
    saveAllListItemBookLinks(all);
  }
}

export function useListItemBookLinks(): Record<string, BookNoteLink> {
  const [links, setLinks] = useState<Record<string, BookNoteLink>>(
    loadAllListItemBookLinks,
  );

  useEffect(() => {
    const sync = () => setLinks(loadAllListItemBookLinks());
    window.addEventListener(LIST_BOOK_LINKS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LIST_BOOK_LINKS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return links;
}

export function normalizeExternalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/[^\s]*)?$/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return "";
}

export function openExternalUrlSafely(rawUrl: string): void {
  const href = normalizeExternalUrl(rawUrl);
  if (!href || typeof document === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function formatUrlDisplayLabel(rawUrl: string): string {
  const normalized = normalizeExternalUrl(rawUrl) || rawUrl.trim();
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./i, "");
    const path =
      parsed.pathname && parsed.pathname !== "/"
        ? parsed.pathname.replace(/\/$/, "")
        : "";
    const shortPath = path.length > 22 ? `${path.slice(0, 20)}…` : path;
    return `${host}${shortPath}`;
  } catch {
    return rawUrl.trim();
  }
}
