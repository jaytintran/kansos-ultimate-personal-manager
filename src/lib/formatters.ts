import type {
  BookFormat,
  BookRecord,
  CoverStyle,
  FolderColor,
  FolderRecord,
  HighlightColor,
} from '../types/library';

export interface CoverPalette {
  name: string;
  bg: string;
  spine: string;
  ink: string;
  accent: string;
}

export const COVER_PALETTES: CoverPalette[] = [
  {name: 'Oxblood', bg: '#4E2326', spine: '#3A181A', ink: '#F5EFE6', accent: '#D89B5A'},
  {name: 'Forest Ink', bg: '#213B31', spine: '#172A22', ink: '#EFF4F0', accent: '#9FC490'},
  {name: 'Deep Lapis', bg: '#1F324D', spine: '#152338', ink: '#EEF3F9', accent: '#8CB6E0'},
  {name: 'Charcoal', bg: '#2B2927', spine: '#1D1B1A', ink: '#F4F0E8', accent: '#C89E68'},
  {name: 'Terracotta', bg: '#7E3C26', spine: '#5F2C1B', ink: '#FBF5EE', accent: '#E8C088'},
  {name: 'Slate Blue', bg: '#384B59', spine: '#283742', ink: '#F0F4F7', accent: '#B8CBD9'},
  {name: 'Plum Cloth', bg: '#432A47', spine: '#301E33', ink: '#F6EFF7', accent: '#D4A5C9'},
  {name: 'Archival Linen', bg: '#DDD3BE', spine: '#C7BBA2', ink: '#262019', accent: '#9A4718'},
];

export const COVER_STYLES: Array<{id: CoverStyle; label: string}> = [
  {id: 'editorial', label: 'Editorial Classic'},
  {id: 'minimal', label: 'Minimal Band'},
  {id: 'framed', label: 'Framed Plate'},
  {id: 'swiss', label: 'Swiss Grid'},
];

export const FOLDER_COLORS: Array<{id: FolderColor; label: string; hex: string; swatch: string}> = [
  {id: 'neutral', label: 'Neutral', hex: '#78716C', swatch: '#78716C'},
  {id: 'slate', label: 'Slate', hex: '#64748B', swatch: '#64748B'},
  {id: 'terracotta', label: 'Terracotta', hex: '#B45309', swatch: '#B45309'},
  {id: 'sage', label: 'Sage', hex: '#3F7D58', swatch: '#3F7D58'},
  {id: 'ochre', label: 'Ochre', hex: '#C68B2C', swatch: '#C68B2C'},
  {id: 'cobalt', label: 'Cobalt', hex: '#3B6998', swatch: '#3B6998'},
  {id: 'plum', label: 'Plum', hex: '#7E4A88', swatch: '#7E4A88'},
  {id: 'rose', label: 'Rose', hex: '#B84A62', swatch: '#B84A62'},
];

export const HIGHLIGHT_COLORS: Array<{id: HighlightColor; label: string; swatch: string}> = [
  {id: 'amber', label: 'Amber', swatch: '#D99B2B'},
  {id: 'sage', label: 'Sage', swatch: '#4D9A6F'},
  {id: 'sky', label: 'Sky', swatch: '#4A90C2'},
  {id: 'rose', label: 'Rose', swatch: '#C4627A'},
];

export function getFolderColorHex(color?: FolderColor | null): string {
  const match = FOLDER_COLORS.find((c) => c.id === color);
  return match?.hex ?? '#64748B';
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function formatShortDate(timestamp?: number | string | null): string {
  if (!timestamp) return '—';
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

export function formatRelativeDate(timestamp?: number | string | null): string {
  if (!timestamp) return 'Never';
  const ms = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (!Number.isFinite(ms)) return 'Never';
  const diffSec = Math.round((Date.now() - ms) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatShortDate(ms);
}

export function getBookFolderIds(book: Pick<BookRecord, 'folderIds' | 'folderId'>): string[] {
  if (Array.isArray(book.folderIds) && book.folderIds.length > 0) {
    return Array.from(new Set(book.folderIds.filter(Boolean)));
  }
  if (book.folderId) {
    return [book.folderId];
  }
  return [];
}

export function withBookFolderIds(book: BookRecord, folderIds: string[]): BookRecord {
  const unique = Array.from(new Set(folderIds.filter(Boolean)));
  return {
    ...book,
    folderIds: unique,
    folderId: unique[0] ?? null,
  };
}

export interface FlattenedFolderNode {
  folder: FolderRecord;
  depth: number;
  pathLabel: string;
}

export function flattenFoldersHierarchy(folders: FolderRecord[]): FlattenedFolderNode[] {
  const byParent = new Map<string | null, FolderRecord[]>();
  const idSet = new Set(folders.map((f) => f.id));

  for (const folder of folders) {
    const parent = folder.parentId && idSet.has(folder.parentId) ? folder.parentId : null;
    const list = byParent.get(parent) ?? [];
    list.push(folder);
    byParent.set(parent, list);
  }

  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const out: FlattenedFolderNode[] = [];
  const visited = new Set<string>();

  const walk = (parentId: string | null, depth: number, prefix: string[]) => {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      const nextPath = [...prefix, child.name];
      out.push({
        folder: child,
        depth,
        pathLabel: nextPath.join(' / '),
      });
      if (depth < 4) {
        walk(child.id, depth + 1, nextPath);
      }
    }
  };

  walk(null, 0, []);
  return out;
}

export function getFolderDescendantIds(folders: FolderRecord[], rootId: string): Set<string> {
  const result = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const f of folders) {
      if (f.parentId && result.has(f.parentId) && !result.has(f.id)) {
        result.add(f.id);
        added = true;
      }
    }
  }
  return result;
}

export function splitFileName(
  fileName: string,
  fallbackFormat: BookFormat
): {baseName: string; extension: string} {
  const trimmed = (fileName || '').trim();
  const match = trimmed.match(/^(.*?)(\.[a-z0-9]{2,6})$/i);
  if (match && match[1]) {
    return {baseName: match[1], extension: match[2].toLowerCase()};
  }
  const fallbackExt = `.${fallbackFormat}`;
  return {baseName: trimmed || 'Untitled', extension: fallbackExt};
}

export function sanitizeFileBaseName(raw: string): string {
  return raw
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export async function compressCoverImageToDataUrl(
  file: File,
  maxWidth = 420,
  maxHeight = 560,
  quality = 0.82
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Invalid image'));
      image.src = objectUrl;
    });

    const ratio = Math.min(1, maxWidth / Math.max(1, img.width), maxHeight / Math.max(1, img.height));
    const width = Math.max(1, Math.round(img.width * ratio));
    const height = Math.max(1, Math.round(img.height * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Compresses an existing image data URL (e.g. extracted from an EPUB) to a
 * compact JPEG thumbnail so BookRecord metadata stays lightweight in storage.
 */
export async function compressCoverDataUrl(
  dataUrl: string,
  maxWidth = 360,
  maxHeight = 520,
  quality = 0.8
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return dataUrl;
  // Keep already-compact covers (e.g. <= ~35 KB binary / 48 KB data URL) untouched
  if (dataUrl.length <= 48_000) return dataUrl;
  // Avoid rasterizing SVGs if tiny; rasterize large images on canvas
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Invalid cover image'));
      image.src = dataUrl;
    });

    const naturalW = Math.max(1, img.naturalWidth || img.width);
    const naturalH = Math.max(1, img.naturalHeight || img.height);
    const ratio = Math.min(1, maxWidth / naturalW, maxHeight / naturalH);
    const width = Math.max(1, Math.round(naturalW * ratio));
    const height = Math.max(1, Math.round(naturalH * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const compressed = canvas.toDataURL('image/jpeg', quality);
    return compressed.length < dataUrl.length ? compressed : dataUrl;
  } catch {
    return dataUrl;
  }
}

