import { useCallback, useEffect, useState } from "react";
import {
  LIST_COVER_CHANGE_EVENT,
  listCoverDb,
  type StoredListItemCover,
} from "../lib/db";
import type { ListItem } from "../types";
import { normalizeExternalUrl } from "./listBookLinks";
import { parseYouTubeCourseUrl } from "./youtube";

const EMPTY_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_COVER_BYTES = 6 * 1024 * 1024;
const DIRECT_IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif|svg|bmp|ico)(?:$|[?#])/i;

const inFlightResolutions = new Map<
  string,
  Promise<StoredListItemCover | null>
>();

export function getEffectiveCoverSourceUrl(
  item: Pick<ListItem, "url" | "coverUrl"> | null | undefined,
): string {
  if (!item) return "";
  const explicitCover = normalizeExternalUrl(item.coverUrl ?? "");
  if (explicitCover) return explicitCover;
  return normalizeExternalUrl(item.url ?? "");
}

export function isLikelyDirectImageUrl(url: string): boolean {
  if (!url) return false;
  return DIRECT_IMAGE_EXT_RE.test(url);
}

async function fetchImageBlobSafely(
  imageUrl: string,
  timeoutMs = 7000,
): Promise<{ blob: Blob; mimeType: string } | null> {
  if (typeof fetch !== "function" || !imageUrl) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(imageUrl, {
      mode: "cors",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const blob = await res.blob();
    const mimeType = (blob.type || contentType || "").toLowerCase();
    if (!blob || blob.size === 0 || blob.size > MAX_COVER_BYTES) return null;
    if (mimeType && !mimeType.startsWith("image/")) return null;
    if (!mimeType && !isLikelyDirectImageUrl(imageUrl)) return null;
    return {
      blob,
      mimeType: mimeType || "image/jpeg",
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchMicrolinkImageUrl(
  targetUrl: string,
  timeoutMs = 8000,
): Promise<string | null> {
  if (typeof fetch !== "function" || !targetUrl) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(endpoint, {
      mode: "cors",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      data?: {
        image?: { url?: string | null; type?: string | null } | null;
      } | null;
    };
    const rawCandidate = json?.data?.image?.url;
    if (!rawCandidate || typeof rawCandidate !== "string") return null;
    return normalizeExternalUrl(rawCandidate) || null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function resolveAndCacheListItemCover(
  itemId: string,
  sourceUrl: string,
  options?: { force?: boolean },
): Promise<StoredListItemCover | null> {
  const normalizedSource = normalizeExternalUrl(sourceUrl);
  if (!itemId || !normalizedSource) {
    if (itemId) await listCoverDb.deleteCover(itemId);
    return null;
  }

  const dedupeKey = `${itemId}::${normalizedSource}::${options?.force ? "1" : "0"}`;
  const existingPromise = inFlightResolutions.get(dedupeKey);
  if (existingPromise) return existingPromise;

  const task = (async (): Promise<StoredListItemCover | null> => {
    if (!options?.force) {
      const cached = await listCoverDb.getCover(itemId);
      if (cached && cached.sourceUrl === normalizedSource) {
        if (cached.status === "ready" && (cached.blob || cached.resolvedImageUrl)) {
          return cached;
        }
        if (
          cached.status === "empty" &&
          Date.now() - cached.updatedAt < EMPTY_CACHE_TTL_MS
        ) {
          return cached;
        }
      }
    }

    let resolvedImageUrl: string | null = null;
    let downloaded: { blob: Blob; mimeType: string } | null = null;

    // 1. YouTube video / playlist high-res thumbnail
    const ytInfo = parseYouTubeCourseUrl(normalizedSource);
    if (ytInfo?.thumbnailUrl) {
      resolvedImageUrl = ytInfo.thumbnailUrl;
    }

    // 2. Direct image file URL by extension
    if (!resolvedImageUrl && isLikelyDirectImageUrl(normalizedSource)) {
      resolvedImageUrl = normalizedSource;
    }

    // 3. Probe direct CORS image header (handles CDN image URLs without extension)
    if (!resolvedImageUrl) {
      const directProbe = await fetchImageBlobSafely(normalizedSource, 4500);
      if (directProbe) {
        resolvedImageUrl = normalizedSource;
        downloaded = directProbe;
      }
    }

    // 4. Fallback to CORS-friendly Microlink OG metadata API for webpages
    if (!resolvedImageUrl) {
      resolvedImageUrl = await fetchMicrolinkImageUrl(normalizedSource);
    }

    if (resolvedImageUrl && !downloaded) {
      downloaded = await fetchImageBlobSafely(resolvedImageUrl, 7000);
    }

    if (!resolvedImageUrl && !downloaded) {
      const emptyRecord: StoredListItemCover = {
        itemId,
        sourceUrl: normalizedSource,
        resolvedImageUrl: null,
        blob: null,
        status: "empty",
        updatedAt: Date.now(),
      };
      await listCoverDb.saveCover(emptyRecord);
      return emptyRecord;
    }

    const readyRecord: StoredListItemCover = {
      itemId,
      sourceUrl: normalizedSource,
      resolvedImageUrl,
      blob: downloaded?.blob ?? null,
      mimeType: downloaded?.mimeType,
      status: "ready",
      updatedAt: Date.now(),
    };
    await listCoverDb.saveCover(readyRecord);
    return readyRecord;
  })();

  inFlightResolutions.set(dedupeKey, task);
  try {
    return await task;
  } finally {
    inFlightResolutions.delete(dedupeKey);
  }
}

export function useListItemCover(
  item: Pick<ListItem, "id" | "url" | "coverUrl"> | null | undefined,
  options?: { disabled?: boolean },
): {
  src: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const itemId = item?.id || "";
  const sourceUrl = options?.disabled ? "" : getEffectiveCoverSourceUrl(item);

  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!itemId) return;
    const onCoverChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ itemId?: string }>).detail;
      if (!detail?.itemId || detail.itemId === itemId) {
        setRevision((r) => r + 1);
      }
    };
    window.addEventListener(LIST_COVER_CHANGE_EVENT, onCoverChanged);
    return () => {
      window.removeEventListener(LIST_COVER_CHANGE_EVENT, onCoverChanged);
    };
  }, [itemId]);

  useEffect(() => {
    let active = true;
    let createdObjectUrl: string | null = null;

    const assignUrlFromRecord = (record: StoredListItemCover | null) => {
      if (!active) return;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
        createdObjectUrl = null;
      }
      if (!record || record.status !== "ready") {
        setSrc(null);
        return;
      }
      if (record.blob) {
        createdObjectUrl = URL.createObjectURL(record.blob);
        setSrc(createdObjectUrl);
      } else if (record.resolvedImageUrl) {
        setSrc(record.resolvedImageUrl);
      } else {
        setSrc(null);
      }
    };

    if (!itemId || !sourceUrl) {
      setSrc(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    (async () => {
      const cached = await listCoverDb.getCover(itemId);
      if (!active) return;

      if (cached && cached.sourceUrl === sourceUrl) {
        if (cached.status === "ready") {
          assignUrlFromRecord(cached);
          setLoading(false);
          return;
        }
        if (
          cached.status === "empty" &&
          Date.now() - cached.updatedAt < EMPTY_CACHE_TTL_MS
        ) {
          setSrc(null);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      const resolved = await resolveAndCacheListItemCover(itemId, sourceUrl);
      if (!active) return;
      assignUrlFromRecord(resolved);
      setLoading(false);
    })();

    return () => {
      active = false;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
        createdObjectUrl = null;
      }
    };
  }, [itemId, sourceUrl, revision]);

  const refresh = useCallback(async () => {
    if (!itemId || !sourceUrl) return;
    setLoading(true);
    try {
      await resolveAndCacheListItemCover(itemId, sourceUrl, { force: true });
    } finally {
      setLoading(false);
    }
  }, [itemId, sourceUrl]);

  return { src, loading, refresh };
}
