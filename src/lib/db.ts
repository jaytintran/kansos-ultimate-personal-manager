import type { BookmarkRecord, HighlightRecord } from "../types/library";
import {
  generateSampleEpubBytes,
  generateSamplePdfBytes,
} from "../utils/ebookStorage";

const DB_NAME = "kanso_library_studio_v2";
const DB_VERSION = 2;
const FILES_STORE = "book_files";
const BOOKMARKS_STORE = "bookmarks";
const HIGHLIGHTS_STORE = "highlights";
const WORKSPACE_STORE = "workspace_state";

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

export interface BookFileAuditEntry {
  bookId: string;
  byteLength: number;
  sha256: string;
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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: "bookId" });
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error || new Error("Failed to open Library Studio DB"));
  });
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
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(FILES_STORE, "readwrite");
        const store = tx.objectStore(FILES_STORE);
        const existingReq = store.getAllKeys();
        existingReq.onsuccess = () => {
          const existingKeys = new Set(
            (existingReq.result || []).map((k) => String(k)),
          );
          for (const rec of prepared) {
            if (!existingKeys.has(rec.bookId)) {
              store.put(rec);
            }
          }
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
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
    const record: StoredBookFile = {
      bookId,
      data,
      byteLength: data.byteLength,
      sha256,
      updatedAt: Date.now(),
    };
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FILES_STORE, "readwrite");
      tx.objectStore(FILES_STORE).put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("Failed to save book file"));
      };
    });
    return record;
  },

  async getBookFile(bookId: string): Promise<StoredBookFile | null> {
    await migrateLegacyV1Once();
    const db = await openDb();
    const existing = await new Promise<StoredBookFile | null>(
      (resolve, reject) => {
        const tx = db.transaction(FILES_STORE, "readonly");
        const req = tx.objectStore(FILES_STORE).get(bookId);
        req.onsuccess = () => {
          db.close();
          resolve((req.result as StoredBookFile | undefined) ?? null);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
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

  async deleteBookFile(bookId: string): Promise<void> {
    await migrateLegacyV1Once();
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FILES_STORE, "readwrite");
      tx.objectStore(FILES_STORE).delete(bookId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  },

  async listAllBookFiles(): Promise<StoredBookFile[]> {
    await migrateLegacyV1Once();
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILES_STORE, "readonly");
      const req = tx.objectStore(FILES_STORE).getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result as StoredBookFile[]) || []);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  },

  async auditStorageFiles(): Promise<BookFileAuditEntry[]> {
    const files = await this.listAllBookFiles();
    return files.map((f) => ({
      bookId: f.bookId,
      byteLength: f.byteLength || f.data?.byteLength || 0,
      sha256: f.sha256 || "",
    }));
  },

  async deleteOrphanBookFiles(bookIds: string[]): Promise<void> {
    if (bookIds.length === 0) return;
    await migrateLegacyV1Once();
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FILES_STORE, "readwrite");
      const store = tx.objectStore(FILES_STORE);
      for (const id of bookIds) store.delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  },

  async pruneBookFiles(validBookIds: Set<string>): Promise<void> {
    await migrateLegacyV1Once();
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FILES_STORE, "readwrite");
      const store = tx.objectStore(FILES_STORE);
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        for (const key of keysReq.result || []) {
          const id = String(key);
          if (!validBookIds.has(id)) {
            store.delete(key);
          }
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  },

  async getBookmarksForBook(bookId: string): Promise<BookmarkRecord[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOKMARKS_STORE, "readonly");
      const idx = tx.objectStore(BOOKMARKS_STORE).index("bookId");
      const req = idx.getAll(bookId);
      req.onsuccess = () => {
        db.close();
        const items = (req.result as BookmarkRecord[]) || [];
        resolve(items.sort((a, b) => a.unitIndex - b.unitIndex));
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  },

  async getAllBookmarks(): Promise<BookmarkRecord[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOKMARKS_STORE, "readonly");
      const req = tx.objectStore(BOOKMARKS_STORE).getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result as BookmarkRecord[]) || []);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  },

  async saveBookmark(bookmark: BookmarkRecord): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BOOKMARKS_STORE, "readwrite");
      tx.objectStore(BOOKMARKS_STORE).put(bookmark);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  },

  async deleteBookmark(id: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BOOKMARKS_STORE, "readwrite");
      tx.objectStore(BOOKMARKS_STORE).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  },

  async getHighlightsForBook(bookId: string): Promise<HighlightRecord[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HIGHLIGHTS_STORE, "readonly");
      const idx = tx.objectStore(HIGHLIGHTS_STORE).index("bookId");
      const req = idx.getAll(bookId);
      req.onsuccess = () => {
        db.close();
        const items = (req.result as HighlightRecord[]) || [];
        resolve(items.sort((a, b) => a.createdAt - b.createdAt));
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  },

  async getAllHighlights(): Promise<HighlightRecord[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HIGHLIGHTS_STORE, "readonly");
      const req = tx.objectStore(HIGHLIGHTS_STORE).getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result as HighlightRecord[]) || []);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  },

  async saveHighlight(highlight: HighlightRecord): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HIGHLIGHTS_STORE, "readwrite");
      tx.objectStore(HIGHLIGHTS_STORE).put(highlight);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  },

  async deleteHighlight(id: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HIGHLIGHTS_STORE, "readwrite");
      tx.objectStore(HIGHLIGHTS_STORE).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  },

  async deleteBooksData(bookIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(bookIds));
    if (uniqueIds.length === 0) return;
    await migrateLegacyV1Once();
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [FILES_STORE, BOOKMARKS_STORE, HIGHLIGHTS_STORE],
        "readwrite",
      );
      const filesStore = tx.objectStore(FILES_STORE);
      const bmStore = tx.objectStore(BOOKMARKS_STORE);
      const bmIdx = bmStore.index("bookId");
      const hlStore = tx.objectStore(HIGHLIGHTS_STORE);
      const hlIdx = hlStore.index("bookId");

      for (const bookId of uniqueIds) {
        filesStore.delete(bookId);
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

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
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
    const db = await openDb();
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
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  },

  async clearAll(): Promise<void> {
    await migrateLegacyV1Once();
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [FILES_STORE, BOOKMARKS_STORE, HIGHLIGHTS_STORE],
        "readwrite",
      );
      tx.objectStore(FILES_STORE).clear();
      tx.objectStore(BOOKMARKS_STORE).clear();
      tx.objectStore(HIGHLIGHTS_STORE).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
    await deleteLegacyDatabase();
  },

  async saveWorkspaceSnapshot(workspace: unknown): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_STORE, "readwrite");
      const record: StoredWorkspaceSnapshot = {
        id: "primary",
        workspace,
        savedAt: Date.now(),
      };
      tx.objectStore(WORKSPACE_STORE).put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("Failed to save workspace snapshot"));
      };
    });
  },

  async loadWorkspaceSnapshot(): Promise<StoredWorkspaceSnapshot | null> {
    if (typeof indexedDB === "undefined") return null;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_STORE, "readonly");
      const req = tx.objectStore(WORKSPACE_STORE).get("primary");
      req.onsuccess = () => {
        db.close();
        resolve((req.result as StoredWorkspaceSnapshot | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  },

  async clearAllData(): Promise<void> {
    await this.clearAll();
  },
};
