import JSZip from "jszip";
import type {
  BookRecord,
  BookmarkRecord,
  CategoryRecord,
  FolderRecord,
  HighlightRecord,
  ViewFolderRecord,
} from "../types/library";
import { resolveBookFileBuffer } from "./bookFileLoader";
import { libraryDb } from "./db";

export interface LibraryBackupFileEntry {
  bookId: string;
  fileName: string;
  data: ArrayBuffer;
}

export interface LibraryBackupSnapshot {
  version: number;
  exportedAt: number;
  books: BookRecord[];
  folders: FolderRecord[];
  categories: CategoryRecord[];
  viewFolders: ViewFolderRecord[];
  bookmarks: BookmarkRecord[];
  highlights: HighlightRecord[];
  files: LibraryBackupFileEntry[];
}

export interface ParsedBackupArchive {
  fileName: string;
  fileSize: number;
  exportedAt: number;
  snapshot: LibraryBackupSnapshot;
}

export async function exportLibraryBackupZip(params: {
  books: BookRecord[];
  folders: FolderRecord[];
  categories: CategoryRecord[];
  viewFolders: ViewFolderRecord[];
  bookmarks: BookmarkRecord[];
  highlights: HighlightRecord[];
  inAppOnly?: boolean;
}): Promise<Blob> {
  const zip = new JSZip();
  const exportedAt = Date.now();
  const fileEntries: Array<{
    bookId: string;
    archivePath: string;
    fileName: string;
  }> = [];

  let candidateBooks = params.books;
  let idbBookIds: Set<string> | null = null;
  if (params.inAppOnly) {
    const audit = await libraryDb.auditStorageFiles().catch(() => []);
    idbBookIds = new Set(audit.map((a) => a.bookId));
    candidateBooks = params.books.filter(
      (b) => b.storageMode !== "android-uri" && idbBookIds!.has(b.id),
    );
  }

  const exportedBookIds = new Set<string>();

  for (const book of candidateBooks) {
    let data: ArrayBuffer | null = null;
    try {
      if (params.inAppOnly) {
        const stored = await libraryDb.getBookFile(book.id);
        data = stored?.data ?? null;
      } else {
        data = await resolveBookFileBuffer(book);
      }
    } catch {
      data = null;
    }
    if (!data) continue;
    const safeExt = book.format || "epub";
    const archivePath = `files/${book.id}.${safeExt}`;
    zip.file(archivePath, data);
    fileEntries.push({ bookId: book.id, archivePath, fileName: book.fileName });
    exportedBookIds.add(book.id);
  }

  const exportedBooks = params.inAppOnly
    ? candidateBooks.filter((b) => exportedBookIds.has(b.id))
    : params.books;

  const exportedBookmarks = params.inAppOnly
    ? params.bookmarks.filter((bm) => exportedBookIds.has(bm.bookId))
    : params.bookmarks;

  const exportedHighlights = params.inAppOnly
    ? params.highlights.filter((hl) => exportedBookIds.has(hl.bookId))
    : params.highlights;

  const exportedViewFolders = params.inAppOnly
    ? params.viewFolders.map((vf) => ({
        ...vf,
        bookIds: vf.bookIds.filter((bid) => exportedBookIds.has(bid)),
      }))
    : params.viewFolders;

  const manifest = {
    version: 1,
    app: "kanso-library",
    exportedAt,
    books: exportedBooks,
    folders: params.folders,
    categories: params.categories,
    viewFolders: exportedViewFolders,
    bookmarks: exportedBookmarks,
    highlights: exportedHighlights,
    fileEntries,
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 5 },
  });
}

export async function parseLibraryBackupZip(
  file: File,
): Promise<ParsedBackupArchive> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error(
      "This archive does not contain a valid Library manifest.json.",
    );
  }

  const rawText = await manifestFile.async("string");
  const parsed = JSON.parse(rawText) as {
    version?: number;
    exportedAt?: number;
    books?: BookRecord[];
    folders?: FolderRecord[];
    categories?: CategoryRecord[];
    viewFolders?: ViewFolderRecord[];
    bookmarks?: BookmarkRecord[];
    highlights?: HighlightRecord[];
    fileEntries?: Array<{
      bookId: string;
      archivePath: string;
      fileName: string;
    }>;
  };

  const files: LibraryBackupFileEntry[] = [];
  const entries = Array.isArray(parsed.fileEntries) ? parsed.fileEntries : [];
  for (const entry of entries) {
    const zf = zip.file(entry.archivePath);
    if (!zf) continue;
    const data = await zf.async("arraybuffer");
    files.push({
      bookId: entry.bookId,
      fileName: entry.fileName,
      data,
    });
  }

  const exportedAt = parsed.exportedAt ?? Date.now();
  return {
    fileName: file.name,
    fileSize: file.size,
    exportedAt,
    snapshot: {
      version: parsed.version ?? 1,
      exportedAt,
      books: Array.isArray(parsed.books) ? parsed.books : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      viewFolders: Array.isArray(parsed.viewFolders) ? parsed.viewFolders : [],
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      files,
    },
  };
}
