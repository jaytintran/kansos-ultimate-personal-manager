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

export type AndroidMediaControlAction =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "stop";

interface KansoSafPluginInterface {
  pickDocuments(options?: {
    allowMultiple?: boolean;
    mediaType?: "ebook" | "audio";
  }): Promise<{
    cancelled: boolean;
    files: AndroidSafPickedFile[];
  }>;
  pickDirectory(): Promise<{
    cancelled: boolean;
    uri?: string;
    name?: string;
  }>;
  scanDirectory(options: {
    treeUri: string;
    mediaType?: "ebook" | "audio";
  }): Promise<{
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
  prepareAudioFile(options: {
    uri: string;
    extension?: string;
    maxCacheBytes?: number;
  }): Promise<{
    filePath: string;
    size: number;
    cacheHit?: boolean;
  }>;
  releaseUri(options: { uri: string }): Promise<void>;
  setSystemChrome(options: { color: string; isDark: boolean }): Promise<void>;
  setBackgroundMediaState(options: {
    playing: boolean;
    title?: string;
    subtitle?: string;
    keepServiceAlive?: boolean;
    showTrackControls?: boolean;
  }): Promise<void>;
  addListener(
    eventName: "mediaControlAction",
    listenerFunc: (event: { action: AndroidMediaControlAction }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const KansoSaf = registerPlugin<KansoSafPluginInterface>("KansoSaf");

const ANDROID_IMPORT_MODE_KEY = "kanso_android_import_mode_v1";
const ANDROID_LINKED_FOLDERS_KEY = "kanso_android_linked_folders_v1";
const AUDIO_ANDROID_IMPORT_MODE_KEY = "kanso_audio_android_import_mode_v1";
const AUDIO_ANDROID_LINKED_FOLDERS_KEY = "kanso_audio_android_linked_folders_v1";

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
  return KansoSaf.pickDocuments({ allowMultiple, mediaType: "ebook" });
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
  const res = await KansoSaf.scanDirectory({ treeUri, mediaType: "ebook" });
  return Array.isArray(res?.files) ? res.files : [];
}

export function getAudioAndroidImportMode(): AndroidImportStorageMode {
  if (typeof localStorage === "undefined") return "ask";
  try {
    const raw = localStorage.getItem(AUDIO_ANDROID_IMPORT_MODE_KEY);
    if (raw === "always-link" || raw === "always-copy" || raw === "ask") {
      return raw;
    }
  } catch {
    // Ignore storage access errors
  }
  return "ask";
}

export function setAudioAndroidImportMode(
  mode: AndroidImportStorageMode,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AUDIO_ANDROID_IMPORT_MODE_KEY, mode);
    window.dispatchEvent(
      new CustomEvent("kanso:audio-android-import-mode-changed", {
        detail: mode,
      }),
    );
  } catch {
    // Ignore storage errors
  }
}

export function getAudioAndroidLinkedFolders(): AndroidLinkedFolder[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(AUDIO_ANDROID_LINKED_FOLDERS_KEY);
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

export function saveAudioAndroidLinkedFolders(
  folders: AndroidLinkedFolder[],
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      AUDIO_ANDROID_LINKED_FOLDERS_KEY,
      JSON.stringify(folders),
    );
  } catch {
    // Ignore storage errors
  }
}

export function addOrUpdateAudioAndroidLinkedFolder(
  folder: AndroidLinkedFolder,
): AndroidLinkedFolder[] {
  const existing = getAudioAndroidLinkedFolders();
  const idx = existing.findIndex((f) => f.uri === folder.uri);
  const next =
    idx >= 0
      ? existing.map((f, i) => (i === idx ? { ...f, ...folder } : f))
      : [folder, ...existing];
  saveAudioAndroidLinkedFolders(next);
  return next;
}

export function removeAudioAndroidLinkedFolder(
  uri: string,
): AndroidLinkedFolder[] {
  const next = getAudioAndroidLinkedFolders().filter((f) => f.uri !== uri);
  saveAudioAndroidLinkedFolders(next);
  void releaseAndroidUri(uri);
  return next;
}

export async function pickAndroidAudioDocuments(
  allowMultiple = true,
): Promise<{ cancelled: boolean; files: AndroidSafPickedFile[] }> {
  if (!isAndroidCapacitor()) {
    return { cancelled: true, files: [] };
  }
  return KansoSaf.pickDocuments({ allowMultiple, mediaType: "audio" });
}

export async function pickAndroidAudioFolder(): Promise<{
  cancelled: boolean;
  uri?: string;
  name?: string;
}> {
  if (!isAndroidCapacitor()) {
    return { cancelled: true };
  }
  return KansoSaf.pickDirectory();
}

export async function scanAndroidAudioFolder(
  treeUri: string,
): Promise<AndroidSafPickedFile[]> {
  if (!isAndroidCapacitor()) return [];
  const res = await KansoSaf.scanDirectory({ treeUri, mediaType: "audio" });
  return Array.isArray(res?.files) ? res.files : [];
}

export async function checkAndroidAudioUris(
  uris: string[],
): Promise<Record<string, boolean>> {
  return checkAndroidBookUris(uris);
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

export async function applyAndroidSystemChrome(
  color: string,
  isDark: boolean,
): Promise<void> {
  if (!isAndroidCapacitor()) return;
  try {
    await KansoSaf.setSystemChrome({ color, isDark });
  } catch {
    // Ignore when running on older native builds without setSystemChrome
  }
}

export async function syncAndroidBackgroundAudio(state: {
  playing: boolean;
  title?: string;
  subtitle?: string;
  keepServiceAlive?: boolean;
  showTrackControls?: boolean;
}): Promise<void> {
  if (!isAndroidCapacitor()) return;
  try {
    await KansoSaf.setBackgroundMediaState({
      playing: state.playing,
      title: state.title,
      subtitle: state.subtitle,
      keepServiceAlive: state.keepServiceAlive,
      showTrackControls: state.showTrackControls,
    });
  } catch {
    // Ignore when running on older native builds without foreground media service support
  }
}

export function subscribeAndroidMediaControls(
  handler: (action: AndroidMediaControlAction) => void,
): () => void {
  if (!isAndroidCapacitor()) {
    return () => {};
  }
  let cancelled = false;
  let removeHandle: (() => Promise<void>) | null = null;

  void KansoSaf.addListener("mediaControlAction", (event) => {
    const act = event?.action;
    if (
      act === "play" ||
      act === "pause" ||
      act === "next" ||
      act === "previous" ||
      act === "stop"
    ) {
      handler(act);
    }
  })
    .then((handle) => {
      if (cancelled) {
        void handle.remove();
      } else {
        removeHandle = handle.remove;
      }
    })
    .catch(() => {
      // Ignore listener registration errors on unsupported runtimes
    });

  return () => {
    cancelled = true;
    if (removeHandle) {
      void removeHandle();
      removeHandle = null;
    }
  };
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

/**
 * Streams a linked Android SAF audio URI into the native Android LRU cache and returns
 * a same-origin Capacitor WebView URL (`https://localhost/_capacitor_file_/...`) that
 * supports native Chromium decoding & byte-range seeking with zero Base64 bridge overhead.
 */
export async function prepareAndroidAudioSrc(
  uri: string,
  extension?: string,
  maxCacheBytes = 256 * 1024 * 1024,
): Promise<{ src: string; filePath: string; size: number }> {
  if (!isAndroidCapacitor()) {
    throw new Error("Android SAF storage is only available in the Android app.");
  }
  const res = await KansoSaf.prepareAudioFile({
    uri,
    extension,
    maxCacheBytes,
  });
  if (!res?.filePath) {
    throw new Error("Native audio cache did not return a playable path.");
  }
  return {
    src: Capacitor.convertFileSrc(res.filePath),
    filePath: res.filePath,
    size: res.size || 0,
  };
}

/**
 * Reads only the leading header slice of a SAF URI for instant ID3/MP4/FLAC/OGG tag parsing.
 */
export async function readAndroidUriHeaderSlice(
  uri: string,
  maxBytes = 393216,
): Promise<{ buffer: ArrayBuffer; totalSize: number }> {
  if (!isAndroidCapacitor()) {
    throw new Error("Android SAF storage is only available in the Android app.");
  }
  const res = await KansoSaf.readDocument({
    uri,
    offset: 0,
    length: maxBytes,
  });
  const bytes = decodeBase64ToUint8Array(res.base64);
  return {
    buffer: bytes.buffer as ArrayBuffer,
    totalSize: Math.max(res.totalSize || 0, bytes.byteLength),
  };
}
