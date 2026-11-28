import type { BookmarkRecord, HighlightRecord } from "../types/library";
import {
  generateSampleEpubBytes,
  generateSamplePdfBytes,
} from "../utils/ebookStorage";

const DB_NAME = "kanso_library_studio_v2";
const DB_VERSION = 6;
const FILES_STORE = "book_files";
const BOOK_FILE_META_STORE = "book_file_meta";
const AUDIO_FILES_STORE = "audio_files";
const AUDIO_FILE_META_STORE = "audio_file_meta";
const CONTACT_PHOTOS_STORE = "contact_photos";
const BOOKMARKS_STORE = "bookmarks";
const HIGHLIGHTS_STORE = "highlights";
const WORKSPACE_STORE = "workspace_state";
const NOTE_IMAGES_STORE = "note_images";
const LIST_ITEM_COVERS_STORE = "list_item_covers";

export const NOTE_IMAGE_URI_PREFIX = "kanso-idb-image://";

export function isLocalNoteImageUri(src: string | undefined | null): boolean {
  return Boolean(src && src.startsWith(NOTE_IMAGE_URI_PREFIX));
}

export function extractNoteImageId(src: string): string {
  return src.slice(NOTE_IMAGE_URI_PREFIX.length);
}

export interface StoredWorkspaceSnapshot {
  id: "primary";
  workspace: unknown;
  savedAt: number;
}

// Legacy Kanso v1 IndexedDB store for seamless zero-data-loss migration
const LEGACY_DB_NAME = "kanso_library_files_v1";
const LEGACY_STORE_NAME = "ebook_files";

export interface StoredBookFile {
  bookId: string;
  data: ArrayBuffer;
  byteLength: number;
  sha256: string;
  updatedAt: number;
}

export interface StoredBookFileMeta {
  bookId: string;
  byteLength: number;
  sha256: string;
  updatedAt: number;
}

export interface BookFileAuditEntry {
  bookId: string;
  byteLength: number;
  sha256: string;
}

export interface StoredAudioFile {
  trackId: string;
  mimeType: string;
  data: ArrayBuffer;
  byteLength: number;
  sha256: string;
  updatedAt: number;
}

export interface StoredAudioFileMeta {
  trackId: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  updatedAt: number;
}

export interface AudioFileAuditEntry {
  trackId: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
}

export interface StoredNoteImage {
  id: string;
  dataUrl: string;
  mimeType: string;
  byteLength: number;
  createdAt: number;
}

export interface StoredListItemCover {
  itemId: string;
  sourceUrl: string;
  resolvedImageUrl?: string | null;
  blob?: Blob | null;
  mimeType?: string;
  status: "ready" | "empty";
  updatedAt: number;
}

export async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // Fallback below if subtle crypto unavailable
  }
  // Lightweight deterministic fallback hash
  const view = new Uint8Array(buffer);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const step = Math.max(1, Math.floor(view.length / 4096));
  for (let i = 0; i < view.length; i += step) {
    h1 = Math.imul(h1 ^ view[i], 2654435761);
    h2 = Math.imul(h2 ^ view[i], 1597334677);
  }
  return `${view.length.toString(16)}-${(h1 >>> 0).toString(16)}-${(h2 >>> 0).toString(16)}`;
}

let cachedDbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (cachedDbPromise) return cachedDbPromise;

  cachedDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: "bookId" });
      }
      if (!db.objectStoreNames.contains(BOOK_FILE_META_STORE)) {
        db.createObjectStore(BOOK_FILE_META_STORE, { keyPath: "bookId" });
      }
      if (!db.objectStoreNames.contains(AUDIO_FILES_STORE)) {
        db.createObjectStore(AUDIO_FILES_STORE, { keyPath: "trackId" });
      }
      if (!db.objectStoreNames.contains(AUDIO_FILE_META_STORE)) {
        db.createObjectStore(AUDIO_FILE_META_STORE, { keyPath: "trackId" });
      }
      if (!db.objectStoreNames.contains(CONTACT_PHOTOS_STORE)) {
        db.createObjectStore(CONTACT_PHOTOS_STORE, { keyPath: "contactId" });
      }
      if (!db.objectStoreNames.contains(BOOKMARKS_STORE)) {
        const bmStore = db.createObjectStore(BOOKMARKS_STORE, {
          keyPath: "id",
        });
        bmStore.createIndex("bookId", "bookId", { unique: false });
      }
      if (!db.objectStoreNames.contains(HIGHLIGHTS_STORE)) {
        const hlStore = db.createObjectStore(HIGHLIGHTS_STORE, {
          keyPath: "id",
        });
        hlStore.createIndex("bookId", "bookId", { unique: false });
      }
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
        db.createObjectStore(WORKSPACE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(NOTE_IMAGES_STORE)) {
        db.createObjectStore(NOTE_IMAGES_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(LIST_ITEM_COVERS_STORE)) {
        db.createObjectStore(LIST_ITEM_COVERS_STORE, { keyPath: "itemId" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        cachedDbPromise = null;
      };
      db.onclose = () => {
        cachedDbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      cachedDbPromise = null;
      reject(req.error || new Error("Failed to open Library Studio DB"));
    };
    req.onblocked = () => {
      cachedDbPromise = null;
    };
  });

  return cachedDbPromise;
}

let legacyMigrationPromise: Promise<void> | null = null;

function deleteLegacyDatabase(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(LEGACY_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function runLegacyV1Migration(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    if (typeof indexedDB.databases === "function") {
      const dbs = await indexedDB.databases().catch(() => null);
      if (dbs && !dbs.some((d) => d.name === LEGACY_DB_NAME)) {
        return;
      }
    }

    const legacyDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(LEGACY_DB_NAME, 1);
      req.onupgradeneeded = () => {
        // Do not fail if store didn't exist
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const migratedEntries: { bookId: string; data: ArrayBuffer }[] = [];
    if (legacyDb.objectStoreNames.contains(LEGACY_STORE_NAME)) {
      await new Promise<void>((resolve) => {
        const tx = legacyDb.transaction(LEGACY_STORE_NAME, "readonly");
        const req = tx.objectStore(LEGACY_STORE_NAME).openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            resolve();
            return;
          }
          const val = cursor.value;
          const buf =
            val instanceof ArrayBuffer
              ? val
              : val?.buffer instanceof ArrayBuffer
                ? val.buffer
                : null;
          if (buf && cursor.key !== undefined && cursor.key !== null) {
            migratedEntries.push({ bookId: String(cursor.key), data: buf });
          }
          cursor.continue();
        };
        req.onerror = () => resolve();
      });
    }
    legacyDb.close();

    if (migratedEntries.length > 0) {
      const prepared = await Promise.all(
        migratedEntries.map(async ({ bookId, data }) => ({
          bookId,
          data,
          byteLength: data.byteLength,
          sha256: await computeSha256Hex(data),
          updatedAt: Date.now(),
        })),
      );
      const db = await getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(
          [FILES_STORE, BOOK_FILE_META_STORE],
          "readwrite",
        );
        const store = tx.objectStore(FILES_STORE);
        const metaStore = tx.objectStore(BOOK_FILE_META_STORE);
        const existingReq = store.getAllKeys();
        existingReq.onsuccess = () => {
          const existingKeys = new Set(
            (existingReq.result || []).map((k) => String(k)),
          );
          for (const rec of prepared) {
            if (!existingKeys.has(rec.bookId)) {
              store.put(rec);
              metaStore.put({
                bookId: rec.bookId,
                byteLength: rec.byteLength,
                sha256: rec.sha256,
                updatedAt: rec.updatedAt,
              } satisfies StoredBookFileMeta);
            }
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    await deleteLegacyDatabase();
  } catch {
    // Non-fatal: continue with primary v2 DB
  }
}

async function migrateLegacyV1Once(): Promise<void> {
  if (!legacyMigrationPromise) {
    legacyMigrationPromise = runLegacyV1Migration();
  }
  await legacyMigrationPromise;
}

export const libraryDb = {
  async saveBookFile(
    bookId: string,
    data: ArrayBuffer,
    precomputedHash?: string,
  ): Promise<StoredBookFile> {
    const sha256 = precomputedHash || (await computeSha256Hex(data));
    const now = Date.now();
    const record: StoredBookFile = {
      bookId,
      data,
      byteLength: data.byteLength,
      sha256,
      updatedAt: now,
    };
    const metaRecord: StoredBookFileMeta = {
      bookId,
      byteLength: data.byteLength,
      sha256,
      updatedAt: now,
    };
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [FILES_STORE, BOOK_FILE_META_STORE],
        "readwrite",
      );
      tx.objectStore(FILES_STORE).put(record);
      tx.objectStore(BOOK_FILE_META_STORE).put(metaRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error("Failed to save book file"));
    });
    return record;
  },

  async getBookFile(bookId: string): Promise<StoredBookFile | null> {
    await migrateLegacyV1Once();
    const db = await getDb();
    const existing = await new Promise<StoredBookFile | null>(
      (resolve, reject) => {
        const tx = db.transaction(FILES_STORE, "readonly");
        const req = tx.objectStore(FILES_STORE).get(bookId);
        req.onsuccess = () =>
          resolve((req.result as StoredBookFile | undefined) ?? null);
        req.onerror = () => reject(req.error);
      },
    );
    if (existing) return existing;

    // Built-in sample books generated on demand directly into the unified v2 IndexedDB
    if (bookId === "book-sample-pdf") {
      const sampleBuf = generateSamplePdfBytes();
      return this.saveBookFile(bookId, sampleBuf);
    }
    if (bookId === "book-sample-epub") {
      const sampleBuf = await generateSampleEpubBytes();
      return this.saveBookFile(bookId, sampleBuf);
    }

    return null;
  },

  async hasBookFile(bookId: string): Promise<boolean> {
    if (bookId === "book-sample-pdf" || bookId === "book-sample-epub") {
      return true;
    }
    await migrateLegacyV1Once();
    const db = await getDb();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(FILES_STORE, "readonly");
        const req = tx.objectStore(FILES_STORE).count(bookId);
        req.onsuccess = () => resolve((req.result || 0) > 0);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  },

  async getBookFileIds(): Promise<Set<string>> {
    await migrateLegacyV1Once();
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILES_STORE, "readonly");
      const req = tx.objectStore(FILES_STORE).getAllKeys();
      req.onsuccess = () => {
        resolve(new Set((req.result || []).map((k) => String(k))));
      };
      req.onerror = () => reject(req.error);
    });
  },

  async deleteBookFile(bookId: string): Promise<void> {
    await migrateLegacyV1Once();
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [FILES_STORE, BOOK_FILE_META_STORE],
        "readwrite",
      );
      tx.objectStore(FILES_STORE).delete(bookId);
      tx.objectStore(BOOK_FILE_META_STORE).delete(bookId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async clearBookFiles(): Promise<void> {
    await migrateLegacyV1Once();
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [FILES_STORE, BOOK_FILE_META_STORE],
        "readwrite",
      );
      tx.objectStore(FILES_STORE).clear();
      tx.objectStore(BOOK_FILE_META_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async listAllBookFiles(): Promise<StoredBookFile[]> {
    await migrateLegacyV1Once();
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILES_STORE, "readonly");
      const req = tx.objectStore(FILES_STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredBookFile[]) || []);
      req.onerror = () => reject(req.error);
    });
  },

  async auditStorageFiles(): Promise<BookFileAuditEntry[]> {
    await migrateLegacyV1Once();
    const db = await getDb();

    const { fileKeys, metaList } = await new Promise<{
      fileKeys: string[];
      metaList: StoredBookFileMeta[];
    }>((resolve, reject) => {
      const tx = db.transaction(
        [FILES_STORE, BOOK_FILE_META_STORE],
        "readonly",
      );
      const keysReq = tx.objectStore(FILES_STORE).getAllKeys();
      const metaReq = tx.objectStore(BOOK_FILE_META_STORE).getAll();
      let keys: string[] = [];
      let metas: StoredBookFileMeta[] = [];
      keysReq.onsuccess = () => {
        keys = (keysReq.result || []).map((k) => String(k));
      };
      metaReq.onsuccess = () => {
        metas = (metaReq.result as StoredBookFileMeta[]) || [];
      };
      tx.oncomplete = () => resolve({ fileKeys: keys, metaList: metas });
      tx.onerror = () => reject(tx.error);
    });

    const keySet = new Set(fileKeys);
    const metaMap = new Map<string, StoredBookFileMeta>();
    const staleMetaIds: string[] = [];
    for (const meta of metaList) {
      if (keySet.has(meta.bookId)) {
        metaMap.set(meta.bookId, meta);
      } else {
        staleMetaIds.push(meta.bookId);
      }
    }

    // Lazily backfill metadata one record at a time for any legacy v4 blobs without loading all ArrayBuffers at once
    const missingMetaIds = fileKeys.filter((id) => !metaMap.has(id));
    const backfilledMetas: StoredBookFileMeta[] = [];
    for (const bookId of missingMetaIds) {
      const rec = await new Promise<StoredBookFile | null>((resolve) => {
        const tx = db.transaction(FILES_STORE, "readonly");
        const req = tx.objectStore(FILES_STORE).get(bookId);
        req.onsuccess = () =>
          resolve((req.result as StoredBookFile | undefined) ?? null);
        req.onerror = () => resolve(null);
      });
      if (rec) {
        const meta: StoredBookFileMeta = {
          bookId: rec.bookId,
          byteLength: rec.byteLength || rec.data?.byteLength || 0,
          sha256: rec.sha256 || "",
          updatedAt: rec.updatedAt || Date.now(),
        };
        metaMap.set(bookId, meta);
        backfilledMetas.push(meta);
      }
    }

    if (backfilledMetas.length > 0 || staleMetaIds.length > 0) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(BOOK_FILE_META_STORE, "readwrite");
        const store = tx.objectStore(BOOK_FILE_META_STORE);
        for (const m of backfilledMetas) store.put(m);
        for (const id of staleMetaIds) store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }

    return fileKeys.map((bookId) => {
      const m = metaMap.get(bookId);
      return {
        bookId,
        byteLength: m?.byteLength ?? 0,
        sha256: m?.sha256 ?? "",
      };
    });
  },

  async deleteOrphanBookFiles(bookIds: string[]): Promise<void> {
    if (bookIds.length === 0) return;
    await migrateLegacyV1Once();
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [FILES_STORE, BOOK_FILE_META_STORE],
        "readwrite",
      );
      const store = tx.objectStore(FILES_STORE);
      const metaStore = tx.objectStore(BOOK_FILE_META_STORE);
      for (const id of bookIds) {
        store.delete(id);
        metaStore.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async pruneBookFiles(validBookIds: Set<string>): Promise<void> {
    await migrateLegacyV1Once();
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [FILES_STORE, BOOK_FILE_META_STORE],
        "readwrite",
      );
      const store = tx.objectStore(FILES_STORE);
      const metaStore = tx.objectStore(BOOK_FILE_META_STORE);
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        for (const key of keysReq.result || []) {
          const id = String(key);
          if (!validBookIds.has(id)) {
            store.delete(key);
            metaStore.delete(key);
          }
        }
      };
      const metaKeysReq = metaStore.getAllKeys();
      metaKeysReq.onsuccess = () => {
        for (const key of metaKeysReq.result || []) {
          const id = String(key);
          if (!validBookIds.has(id)) {
            metaStore.delete(key);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getBookmarksForBook(bookId: string): Promise<BookmarkRecord[]> {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOKMARKS_STORE, "readonly");
      const idx = tx.objectStore(BOOKMARKS_STORE).index("bookId");
      const req = idx.getAll(bookId);
      req.onsuccess = () => {
        const items = (req.result as BookmarkRecord[]) || [];
        resolve(items.sort((a, b) => a.unitIndex - b.unitIndex));
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getAllBookmarks(): Promise<BookmarkRecord[]> {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOKMARKS_STORE, "readonly");
      const req = tx.objectStore(BOOKMARKS_STORE).getAll();
      req.onsuccess = () => resolve((req.result as BookmarkRecord[]) || []);
      req.onerror = () => reject(req.error);
    });
  },

  async saveBookmark(bookmark: BookmarkRecord): Promise<void> {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BOOKMARKS_STORE, "readwrite");
      tx.objectStore(BOOKMARKS_STORE).put(bookmark);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteBookmark(id: string): Promise<void> {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BOOKMARKS_STORE, "readwrite");
      tx.objectStore(BOOKMARKS_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getHighlightsForBook(bookId: string): Promise<HighlightRecord[]> {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HIGHLIGHTS_STORE, "readonly");
      const idx = tx.objectStore(HIGHLIGHTS_STORE).index("bookId");
      const req = idx.getAll(bookId);
      req.onsuccess = () => {
        const items = (req.result as HighlightRecord[]) || [];
        resolve(items.sort((a, b) => a.createdAt - b.createdAt));
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getAllHighlights(): Promise<HighlightRecord[]> {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HIGHLIGHTS_STORE, "readonly");
      const req = tx.objectStore(HIGHLIGHTS_STORE).getAll();
      req.onsuccess = () => resolve((req.result as HighlightRecord[]) || []);
      req.onerror = () => reject(req.error);
    });
  },

  async saveHighlight(highlight: HighlightRecord): Promise<void> {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HIGHLIGHTS_STORE, "readwrite");
      tx.objectStore(HIGHLIGHTS_STORE).put(highlight);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteHighlight(id: string): Promise<void> {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HIGHLIGHTS_STORE, "readwrite");
      tx.objectStore(HIGHLIGHTS_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteBooksData(bookIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(bookIds));
    if (uniqueIds.length === 0) return;
    await migrateLegacyV1Once();
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [FILES_STORE, BOOK_FILE_META_STORE, BOOKMARKS_STORE, HIGHLIGHTS_STORE],
        "readwrite",
      );
      const filesStore = tx.objectStore(FILES_STORE);
      const metaStore = tx.objectStore(BOOK_FILE_META_STORE);
      const bmStore = tx.objectStore(BOOKMARKS_STORE);
      const bmIdx = bmStore.index("bookId");
      const hlStore = tx.objectStore(HIGHLIGHTS_STORE);
      const hlIdx = hlStore.index("bookId");

      for (const bookId of uniqueIds) {
        filesStore.delete(bookId);
        metaStore.delete(bookId);
        const bmKeysReq = bmIdx.getAllKeys(bookId);
        bmKeysReq.onsuccess = () => {
          for (const key of bmKeysReq.result || []) {
            bmStore.delete(key);
          }
        };
        const hlKeysReq = hlIdx.getAllKeys(bookId);
        hlKeysReq.onsuccess = () => {
          for (const key of hlKeysReq.result || []) {
            hlStore.delete(key);
          }
        };
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteBookAssets(bookId: string): Promise<void> {
    await this.deleteBooksData([bookId]);
  },

  async deleteBookData(bookId: string): Promise<void> {
    await this.deleteBooksData([bookId]);
  },

  async replaceAllAnnotations(
    bookmarks: BookmarkRecord[],
    highlights: HighlightRecord[],
  ): Promise<void> {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [BOOKMARKS_STORE, HIGHLIGHTS_STORE],
        "readwrite",
      );
      const bmStore = tx.objectStore(BOOKMARKS_STORE);
      const hlStore = tx.objectStore(HIGHLIGHTS_STORE);
      bmStore.clear();
      hlStore.clear();
      for (const bm of bookmarks) bmStore.put(bm);
      for (const hl of highlights) hlStore.put(hl);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async clearAll(): Promise<void> {
    await migrateLegacyV1Once();
    const db = await getDb();
    const stores = [
      FILES_STORE,
      BOOK_FILE_META_STORE,
      AUDIO_FILES_STORE,
      AUDIO_FILE_META_STORE,
      CONTACT_PHOTOS_STORE,
      BOOKMARKS_STORE,
      HIGHLIGHTS_STORE,
      WORKSPACE_STORE,
      NOTE_IMAGES_STORE,
      LIST_ITEM_COVERS_STORE,
    ].filter((name) => db.objectStoreNames.contains(name));

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, "readwrite");
      for (const name of stores) {
        tx.objectStore(name).clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await deleteLegacyDatabase();
  },

  async saveWorkspaceSnapshot(workspace: unknown): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_STORE, "readwrite");
      const record: StoredWorkspaceSnapshot = {
        id: "primary",
        workspace,
        savedAt: Date.now(),
      };
      tx.objectStore(WORKSPACE_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error("Failed to save workspace snapshot"));
    });
  },

  async loadWorkspaceSnapshot(): Promise<StoredWorkspaceSnapshot | null> {
    if (typeof indexedDB === "undefined") return null;
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_STORE, "readonly");
      const req = tx.objectStore(WORKSPACE_STORE).get("primary");
      req.onsuccess = () =>
        resolve((req.result as StoredWorkspaceSnapshot | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  },

  async clearAllData(): Promise<void> {
    await this.clearAll();
  },
};

export const audioDb = {
  async saveAudioFile(
    trackId: string,
    data: ArrayBuffer,
    mimeType = "audio/mpeg",
    precomputedHash?: string,
  ): Promise<StoredAudioFile> {
    const sha256 = precomputedHash || (await computeSha256Hex(data));
    const now = Date.now();
    const record: StoredAudioFile = {
      trackId,
      mimeType,
      data,
      byteLength: data.byteLength,
      sha256,
      updatedAt: now,
    };
    const metaRecord: StoredAudioFileMeta = {
      trackId,
      mimeType,
      byteLength: data.byteLength,
      sha256,
      updatedAt: now,
    };
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [AUDIO_FILES_STORE, AUDIO_FILE_META_STORE],
        "readwrite",
      );
      tx.objectStore(AUDIO_FILES_STORE).put(record);
      tx.objectStore(AUDIO_FILE_META_STORE).put(metaRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error("Failed to save audio file"));
    });
    return record;
  },

  async getAudioFile(trackId: string): Promise<StoredAudioFile | null> {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_FILES_STORE, "readonly");
      const req = tx.objectStore(AUDIO_FILES_STORE).get(trackId);
      req.onsuccess = () =>
        resolve((req.result as StoredAudioFile | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  },

  async hasAudioFile(trackId: string): Promise<boolean> {
    const db = await getDb();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(AUDIO_FILES_STORE, "readonly");
        const req = tx.objectStore(AUDIO_FILES_STORE).count(trackId);
        req.onsuccess = () => resolve((req.result || 0) > 0);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  },

  async getAudioFileIds(): Promise<Set<string>> {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_FILES_STORE, "readonly");
      const req = tx.objectStore(AUDIO_FILES_STORE).getAllKeys();
      req.onsuccess = () => {
        resolve(new Set((req.result || []).map((k) => String(k))));
      };
      req.onerror = () => reject(req.error);
    });
  },

  async deleteAudioFile(trackId: string): Promise<void> {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [AUDIO_FILES_STORE, AUDIO_FILE_META_STORE],
        "readwrite",
      );
      tx.objectStore(AUDIO_FILES_STORE).delete(trackId);
      tx.objectStore(AUDIO_FILE_META_STORE).delete(trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteAudioFiles(trackIds: string[]): Promise<void> {
    const unique = Array.from(new Set(trackIds.filter(Boolean)));
    if (unique.length === 0) return;
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [AUDIO_FILES_STORE, AUDIO_FILE_META_STORE],
        "readwrite",
      );
      const store = tx.objectStore(AUDIO_FILES_STORE);
      const metaStore = tx.objectStore(AUDIO_FILE_META_STORE);
      for (const id of unique) {
        store.delete(id);
        metaStore.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async listAllAudioFiles(): Promise<StoredAudioFile[]> {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_FILES_STORE, "readonly");
      const req = tx.objectStore(AUDIO_FILES_STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredAudioFile[]) || []);
      req.onerror = () => reject(req.error);
    });
  },

  async auditAudioFiles(): Promise<AudioFileAuditEntry[]> {
    const db = await getDb();

    const { trackKeys, metaList } = await new Promise<{
      trackKeys: string[];
      metaList: StoredAudioFileMeta[];
    }>((resolve, reject) => {
      const tx = db.transaction(
        [AUDIO_FILES_STORE, AUDIO_FILE_META_STORE],
        "readonly",
      );
      const keysReq = tx.objectStore(AUDIO_FILES_STORE).getAllKeys();
      const metaReq = tx.objectStore(AUDIO_FILE_META_STORE).getAll();
      let keys: string[] = [];
      let metas: StoredAudioFileMeta[] = [];
      keysReq.onsuccess = () => {
        keys = (keysReq.result || []).map((k) => String(k));
      };
      metaReq.onsuccess = () => {
        metas = (metaReq.result as StoredAudioFileMeta[]) || [];
      };
      tx.oncomplete = () => resolve({ trackKeys: keys, metaList: metas });
      tx.onerror = () => reject(tx.error);
    });

    const keySet = new Set(trackKeys);
    const metaMap = new Map<string, StoredAudioFileMeta>();
    const staleMetaIds: string[] = [];
    for (const meta of metaList) {
      if (keySet.has(meta.trackId)) {
        metaMap.set(meta.trackId, meta);
      } else {
        staleMetaIds.push(meta.trackId);
      }
    }

    // Lazily backfill metadata one record at a time without loading all audio ArrayBuffers into RAM
    const missingMetaIds = trackKeys.filter((id) => !metaMap.has(id));
    const backfilledMetas: StoredAudioFileMeta[] = [];
    for (const trackId of missingMetaIds) {
      const rec = await new Promise<StoredAudioFile | null>((resolve) => {
        const tx = db.transaction(AUDIO_FILES_STORE, "readonly");
        const req = tx.objectStore(AUDIO_FILES_STORE).get(trackId);
        req.onsuccess = () =>
          resolve((req.result as StoredAudioFile | undefined) ?? null);
        req.onerror = () => resolve(null);
      });
      if (rec) {
        const meta: StoredAudioFileMeta = {
          trackId: rec.trackId,
          mimeType: rec.mimeType || "audio/mpeg",
          byteLength: rec.byteLength || rec.data?.byteLength || 0,
          sha256: rec.sha256 || "",
          updatedAt: rec.updatedAt || Date.now(),
        };
        metaMap.set(trackId, meta);
        backfilledMetas.push(meta);
      }
    }

    if (backfilledMetas.length > 0 || staleMetaIds.length > 0) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(AUDIO_FILE_META_STORE, "readwrite");
        const store = tx.objectStore(AUDIO_FILE_META_STORE);
        for (const m of backfilledMetas) store.put(m);
        for (const id of staleMetaIds) store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }

    return trackKeys.map((trackId) => {
      const m = metaMap.get(trackId);
      return {
        trackId,
        mimeType: m?.mimeType || "audio/mpeg",
        byteLength: m?.byteLength ?? 0,
        sha256: m?.sha256 ?? "",
      };
    });
  },

  async deleteOrphanAudioFiles(trackIds: string[]): Promise<void> {
    await this.deleteAudioFiles(trackIds);
  },

  async pruneAudioFiles(validTrackIds: Set<string>): Promise<void> {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [AUDIO_FILES_STORE, AUDIO_FILE_META_STORE],
        "readwrite",
      );
      const store = tx.objectStore(AUDIO_FILES_STORE);
      const metaStore = tx.objectStore(AUDIO_FILE_META_STORE);
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        for (const key of keysReq.result || []) {
          const id = String(key);
          if (!validTrackIds.has(id)) {
            store.delete(key);
            metaStore.delete(key);
          }
        }
      };
      const metaKeysReq = metaStore.getAllKeys();
      metaKeysReq.onsuccess = () => {
        for (const key of metaKeysReq.result || []) {
          const id = String(key);
          if (!validTrackIds.has(id)) {
            metaStore.delete(key);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async clearAllAudioFiles(): Promise<void> {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [AUDIO_FILES_STORE, AUDIO_FILE_META_STORE],
        "readwrite",
      );
      tx.objectStore(AUDIO_FILES_STORE).clear();
      tx.objectStore(AUDIO_FILE_META_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

export interface StoredContactPhoto {
  contactId: string;
  dataUrl: string;
  updatedAt: number;
}

export const CONTACT_PHOTO_CHANGE_EVENT = "kanso:contact-photo-changed";

function notifyContactPhotoChanged(contactId?: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CONTACT_PHOTO_CHANGE_EVENT, { detail: { contactId } }),
    );
  }
}

export const contactPhotoDb = {
  async savePhoto(contactId: string, dataUrl: string): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CONTACT_PHOTOS_STORE, "readwrite");
      const record: StoredContactPhoto = {
        contactId,
        dataUrl,
        updatedAt: Date.now(),
      };
      tx.objectStore(CONTACT_PHOTOS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error("Failed to save contact photo"));
    });
    notifyContactPhotoChanged(contactId);
  },

  async getPhoto(contactId: string): Promise<string | null> {
    if (typeof indexedDB === "undefined") return null;
    try {
      const db = await getDb();
      return await new Promise((resolve) => {
        try {
          const tx = db.transaction(CONTACT_PHOTOS_STORE, "readonly");
          const req = tx.objectStore(CONTACT_PHOTOS_STORE).get(contactId);
          req.onsuccess = () => {
            const res = req.result as StoredContactPhoto | undefined;
            resolve(res?.dataUrl ?? null);
          };
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  },

  async deletePhoto(contactId: string): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CONTACT_PHOTOS_STORE, "readwrite");
      tx.objectStore(CONTACT_PHOTOS_STORE).delete(contactId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    notifyContactPhotoChanged(contactId);
  },

  async listAllPhotos(): Promise<Record<string, string>> {
    if (typeof indexedDB === "undefined") return {};
    try {
      const db = await getDb();
      return await new Promise((resolve) => {
        try {
          const tx = db.transaction(CONTACT_PHOTOS_STORE, "readonly");
          const req = tx.objectStore(CONTACT_PHOTOS_STORE).getAll();
          req.onsuccess = () => {
            const map: Record<string, string> = {};
            for (const rec of (req.result as StoredContactPhoto[]) || []) {
              if (rec?.contactId && rec?.dataUrl) {
                map[rec.contactId] = rec.dataUrl;
              }
            }
            resolve(map);
          };
          req.onerror = () => resolve({});
        } catch {
          resolve({});
        }
      });
    } catch {
      return {};
    }
  },

  async prunePhotos(validContactIds: Set<string>): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    try {
      const db = await getDb();
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(CONTACT_PHOTOS_STORE, "readwrite");
          const store = tx.objectStore(CONTACT_PHOTOS_STORE);
          const keysReq = store.getAllKeys();
          keysReq.onsuccess = () => {
            for (const key of keysReq.result || []) {
              if (!validContactIds.has(String(key))) {
                store.delete(key);
              }
            }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } catch {
      // Ignore
    }
  },

  async clearAllPhotos(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    try {
      const db = await getDb();
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(CONTACT_PHOTOS_STORE, "readwrite");
          tx.objectStore(CONTACT_PHOTOS_STORE).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
      notifyContactPhotoChanged();
    } catch {
      // Ignore
    }
  },
};

export const noteImageDb = {
  async saveImage(
    id: string,
    dataUrl: string,
    mimeType = "image/webp",
  ): Promise<string> {
    if (typeof indexedDB === "undefined") return dataUrl;
    const db = await getDb();
    const record: StoredNoteImage = {
      id,
      dataUrl,
      mimeType,
      byteLength: dataUrl.length,
      createdAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NOTE_IMAGES_STORE, "readwrite");
      tx.objectStore(NOTE_IMAGES_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error("Failed to save note image"));
    });
    return `${NOTE_IMAGE_URI_PREFIX}${id}`;
  },

  async getImage(id: string): Promise<string | null> {
    if (typeof indexedDB === "undefined") return null;
    try {
      const db = await getDb();
      return await new Promise((resolve) => {
        try {
          const tx = db.transaction(NOTE_IMAGES_STORE, "readonly");
          const req = tx.objectStore(NOTE_IMAGES_STORE).get(id);
          req.onsuccess = () => {
            const res = req.result as StoredNoteImage | undefined;
            resolve(res?.dataUrl ?? null);
          };
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  },

  async deleteImage(id: string): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    try {
      const db = await getDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(NOTE_IMAGES_STORE, "readwrite");
        tx.objectStore(NOTE_IMAGES_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore
    }
  },

  async clearAllImages(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    try {
      const db = await getDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(NOTE_IMAGES_STORE, "readwrite");
        tx.objectStore(NOTE_IMAGES_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore
    }
  },
};

export const LIST_COVER_CHANGE_EVENT = "kanso:list-cover-changed";

function notifyListCoverChanged(itemId?: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(LIST_COVER_CHANGE_EVENT, { detail: { itemId } }),
    );
  }
}

export const listCoverDb = {
  async getCover(itemId: string): Promise<StoredListItemCover | null> {
    if (typeof indexedDB === "undefined" || !itemId) return null;
    try {
      const db = await getDb();
      return await new Promise((resolve) => {
        try {
          const tx = db.transaction(LIST_ITEM_COVERS_STORE, "readonly");
          const req = tx.objectStore(LIST_ITEM_COVERS_STORE).get(itemId);
          req.onsuccess = () =>
            resolve((req.result as StoredListItemCover | undefined) ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  },

  async saveCover(record: StoredListItemCover): Promise<void> {
    if (typeof indexedDB === "undefined" || !record.itemId) return;
    try {
      const db = await getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(LIST_ITEM_COVERS_STORE, "readwrite");
        tx.objectStore(LIST_ITEM_COVERS_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      notifyListCoverChanged(record.itemId);
    } catch {
      // Non-fatal cache write failure
    }
  },

  async deleteCover(itemId: string): Promise<void> {
    await this.deleteCovers([itemId]);
  },

  async deleteCovers(itemIds: string[]): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    const unique = Array.from(new Set(itemIds.filter(Boolean)));
    if (unique.length === 0) return;
    try {
      const db = await getDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(LIST_ITEM_COVERS_STORE, "readwrite");
        const store = tx.objectStore(LIST_ITEM_COVERS_STORE);
        for (const id of unique) store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      for (const id of unique) notifyListCoverChanged(id);
    } catch {
      // Ignore
    }
  },

  async clearAllCovers(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    try {
      const db = await getDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(LIST_ITEM_COVERS_STORE, "readwrite");
        tx.objectStore(LIST_ITEM_COVERS_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      notifyListCoverChanged();
    } catch {
      // Ignore
    }
  },
};
