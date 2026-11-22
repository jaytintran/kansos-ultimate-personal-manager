import { Capacitor, registerPlugin } from "@capacitor/core";

export type AndroidImportStorageMode = "ask" | "always-link" | "always-copy";

export interface AndroidSafPickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface AndroidLinkedFolder {
  uri: string;
  name: string;
  addedAt: number;
  lastScannedAt: number | null;
  lastFoundCount?: number;
}

interface KansoSafPluginInterface {
  pickDocuments(options?: { allowMultiple?: boolean }): Promise<{
    cancelled: boolean;
    files: AndroidSafPickedFile[];
  }>;
  pickDirectory(): Promise<{
    cancelled: boolean;
    uri?: string;
    name?: string;
  }>;
  scanDirectory(options: { treeUri: string }): Promise<{
    files: AndroidSafPickedFile[];
  }>;
  checkUris(options: { uris: string[] }): Promise<{
    statuses: Record<string, boolean>;
  }>;
  readDocument(options: {
    uri: string;
    offset?: number;
    length?: number;
  }): Promise<{
    base64: string;
    byteLength: number;
    totalSize: number;
  }>;
  releaseUri(options: { uri: string }): Promise<void>;
}

const KansoSaf = registerPlugin<KansoSafPluginInterface>("KansoSaf");

const ANDROID_IMPORT_MODE_KEY = "kanso_android_import_mode_v1";
const ANDROID_LINKED_FOLDERS_KEY = "kanso_android_linked_folders_v1";

/**
 * Returns true ONLY inside the native Android Capacitor runtime.
 * Web desktop / PWA builds always return false so web behavior remains untouched.
 */
export function isAndroidCapacitor(): boolean {
  try {
    return (
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
    );
  } catch {
    return false;
  }
}

export function getAndroidImportMode(): AndroidImportStorageMode {
  if (typeof localStorage === "undefined") return "ask";
  try {
    const raw = localStorage.getItem(ANDROID_IMPORT_MODE_KEY);
    if (raw === "always-link" || raw === "always-copy" || raw === "ask") {
      return raw;
    }
  } catch {
    // Ignore storage access errors
  }
  return "ask";
}

export function setAndroidImportMode(mode: AndroidImportStorageMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ANDROID_IMPORT_MODE_KEY, mode);
    window.dispatchEvent(
      new CustomEvent("kanso:android-import-mode-changed", { detail: mode }),
    );
  } catch {
    // Ignore storage errors
  }
}

export function getAndroidLinkedFolders(): AndroidLinkedFolder[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(ANDROID_LINKED_FOLDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is AndroidLinkedFolder =>
        Boolean(f) && typeof f.uri === "string" && typeof f.name === "string",
    );
  } catch {
    return [];
  }
}

export function saveAndroidLinkedFolders(
  folders: AndroidLinkedFolder[],
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ANDROID_LINKED_FOLDERS_KEY, JSON.stringify(folders));
  } catch {
    // Ignore storage errors
  }
}

export function addOrUpdateAndroidLinkedFolder(
  folder: AndroidLinkedFolder,
): AndroidLinkedFolder[] {
  const existing = getAndroidLinkedFolders();
  const idx = existing.findIndex((f) => f.uri === folder.uri);
  const next =
    idx >= 0
      ? existing.map((f, i) => (i === idx ? { ...f, ...folder } : f))
      : [folder, ...existing];
  saveAndroidLinkedFolders(next);
  return next;
}

export function removeAndroidLinkedFolder(uri: string): AndroidLinkedFolder[] {
  const next = getAndroidLinkedFolders().filter((f) => f.uri !== uri);
  saveAndroidLinkedFolders(next);
  void releaseAndroidUri(uri);
  return next;
}

export async function pickAndroidBookDocuments(
  allowMultiple = true,
): Promise<{ cancelled: boolean; files: AndroidSafPickedFile[] }> {
  if (!isAndroidCapacitor()) {
    return { cancelled: true, files: [] };
  }
  return KansoSaf.pickDocuments({ allowMultiple });
}

export async function pickAndroidBookFolder(): Promise<{
  cancelled: boolean;
  uri?: string;
  name?: string;
}> {
  if (!isAndroidCapacitor()) {
    return { cancelled: true };
  }
  return KansoSaf.pickDirectory();
}

export async function scanAndroidBookFolder(
  treeUri: string,
): Promise<AndroidSafPickedFile[]> {
  if (!isAndroidCapacitor()) return [];
  const res = await KansoSaf.scanDirectory({ treeUri });
  return Array.isArray(res?.files) ? res.files : [];
}

export async function checkAndroidBookUris(
  uris: string[],
): Promise<Record<string, boolean>> {
  if (!isAndroidCapacitor() || uris.length === 0) return {};
  try {
    const res = await KansoSaf.checkUris({ uris });
    return res?.statuses ?? {};
  } catch {
    return {};
  }
}

export async function releaseAndroidUri(uri: string): Promise<void> {
  if (!isAndroidCapacitor() || !uri) return;
  try {
    await KansoSaf.releaseUri({ uri });
  } catch {
    // Ignore errors when releasing permissions
  }
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Streams a persisted Android SAF content:// URI directly into memory as an ArrayBuffer
 * without creating a copy inside IndexedDB. Uses 8 MB chunks for large files to prevent
 * bridge allocation spikes.
 */
export async function readAndroidUriAsArrayBuffer(
  uri: string,
  knownSize = 0,
): Promise<ArrayBuffer> {
  if (!isAndroidCapacitor()) {
    throw new Error("Android SAF storage is only available in the Android app.");
  }

  const CHUNK_THRESHOLD = 12 * 1024 * 1024;
  const CHUNK_SIZE = 6 * 1024 * 1024;

  if (knownSize > 0 && knownSize <= CHUNK_THRESHOLD) {
    const res = await KansoSaf.readDocument({ uri });
    return decodeBase64ToUint8Array(res.base64).buffer as ArrayBuffer;
  }

  // Probe/read first chunk
  const first = await KansoSaf.readDocument({
    uri,
    offset: 0,
    length: CHUNK_SIZE,
  });
  const firstBytes = decodeBase64ToUint8Array(first.base64);
  const totalSize = Math.max(first.totalSize || 0, firstBytes.byteLength);

  if (firstBytes.byteLength < CHUNK_SIZE || firstBytes.byteLength >= totalSize) {
    return firstBytes.buffer as ArrayBuffer;
  }

  const chunks: Uint8Array[] = [firstBytes];
  let offset = firstBytes.byteLength;
  while (offset < totalSize) {
    const next = await KansoSaf.readDocument({
      uri,
      offset,
      length: CHUNK_SIZE,
    });
    const part = decodeBase64ToUint8Array(next.base64);
    if (part.byteLength === 0) break;
    chunks.push(part);
    offset += part.byteLength;
    if (part.byteLength < CHUNK_SIZE) break;
  }

  const finalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const combined = new Uint8Array(finalSize);
  let cursor = 0;
  for (const chunk of chunks) {
    combined.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return combined.buffer as ArrayBuffer;
}
