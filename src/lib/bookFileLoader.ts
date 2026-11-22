import type { BookRecord } from "../types/library";
import {
  checkAndroidBookUris,
  isAndroidCapacitor,
  readAndroidUriAsArrayBuffer,
} from "../utils/androidSaf";
import { libraryDb } from "./db";

export class BookFileMissingError extends Error {
  bookId: string;
  reason: "not-on-device" | "uri-unreadable";

  constructor(
    bookId: string,
    reason: "not-on-device" | "uri-unreadable",
    message: string,
  ) {
    super(message);
    this.name = "BookFileMissingError";
    this.bookId = bookId;
    this.reason = reason;
  }
}

/**
 * Resolves the raw e-book ArrayBuffer for a BookRecord from either:
 * 1) Persisted Android SAF content:// URI (zero-copy, Android Capacitor only)
 * 2) Local IndexedDB `book_files` store (or built-in sample generator)
 */
export async function resolveBookFileBuffer(
  book: BookRecord,
): Promise<ArrayBuffer> {
  if (book.storageMode === "android-uri" && book.externalUri) {
    if (isAndroidCapacitor()) {
      try {
        return await readAndroidUriAsArrayBuffer(
          book.externalUri,
          book.fileSize,
        );
      } catch {
        // Fallback to IndexedDB if a cached blob also exists locally
        const cached = await libraryDb.getBookFile(book.id);
        if (cached?.data) return cached.data;
        throw new BookFileMissingError(
          book.id,
          "uri-unreadable",
          `The linked file "${book.fileName}" could not be read from device storage. It may have been moved, renamed, or deleted.`,
        );
      }
    }
  }

  const stored = await libraryDb.getBookFile(book.id);
  if (stored?.data) {
    return stored.data;
  }

  throw new BookFileMissingError(
    book.id,
    "not-on-device",
    `The file "${book.fileName}" is not on this device yet. Link it from your storage to start reading.`,
  );
}

/**
 * Audits which books currently have an accessible binary file on this device
 * (either in IndexedDB `book_files` or via a readable Android SAF URI).
 * Returns the Set of book IDs that are missing/unlinked.
 */
export async function findMissingBookIds(
  books: BookRecord[],
): Promise<Set<string>> {
  const missing = new Set<string>();
  if (books.length === 0) return missing;

  const auditEntries = await libraryDb.auditStorageFiles().catch(() => []);
  const idbIds = new Set(auditEntries.map((e) => e.bookId));

  const androidUrisToCheck: string[] = [];
  if (isAndroidCapacitor()) {
    for (const book of books) {
      if (book.storageMode === "android-uri" && book.externalUri) {
        androidUrisToCheck.push(book.externalUri);
      }
    }
  }

  const uriStatusMap =
    androidUrisToCheck.length > 0
      ? await checkAndroidBookUris(androidUrisToCheck)
      : {};

  for (const book of books) {
    if (
      book.id === "book-sample-pdf" ||
      book.id === "book-sample-epub" ||
      book.isBuiltInSample
    ) {
      continue;
    }
    if (idbIds.has(book.id)) {
      continue;
    }
    if (
      isAndroidCapacitor() &&
      book.storageMode === "android-uri" &&
      book.externalUri &&
      uriStatusMap[book.externalUri] === true
    ) {
      continue;
    }
    missing.add(book.id);
  }

  return missing;
}
