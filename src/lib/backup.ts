import JSZip from 'jszip';
import type {
  BookRecord,
  BookmarkRecord,
  CategoryRecord,
  FolderRecord,
  HighlightRecord,
  ViewFolderRecord,
} from '../types/library';
import {libraryDb} from './db';

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
}): Promise<Blob> {
  const zip = new JSZip();
  const exportedAt = Date.now();
  const fileEntries: Array<{bookId: string; archivePath: string; fileName: string}> = [];

  for (const book of params.books) {
    const stored = await libraryDb.getBookFile(book.id);
    if (!stored) continue;
    const safeExt = book.format || 'epub';
    const archivePath = `files/${book.id}.${safeExt}`;
    zip.file(archivePath, stored.data);
    fileEntries.push({bookId: book.id, archivePath, fileName: book.fileName});
  }

  const manifest = {
    version: 1,
    app: 'kanso-library',
    exportedAt,
    books: params.books,
    folders: params.folders,
    categories: params.categories,
    viewFolders: params.viewFolders,
    bookmarks: params.bookmarks,
    highlights: params.highlights,
    fileEntries,
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({type: 'blob', compression: 'DEFLATE', compressionOptions: {level: 5}});
}

export async function parseLibraryBackupZip(file: File): Promise<ParsedBackupArchive> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('This archive does not contain a valid Library manifest.json.');
  }

  const rawText = await manifestFile.async('string');
  const parsed = JSON.parse(rawText) as {
    version?: number;
    exportedAt?: number;
    books?: BookRecord[];
    folders?: FolderRecord[];
    categories?: CategoryRecord[];
    viewFolders?: ViewFolderRecord[];
    bookmarks?: BookmarkRecord[];
    highlights?: HighlightRecord[];
    fileEntries?: Array<{bookId: string; archivePath: string; fileName: string}>;
  };

  const files: LibraryBackupFileEntry[] = [];
  const entries = Array.isArray(parsed.fileEntries) ? parsed.fileEntries : [];
  for (const entry of entries) {
    const zf = zip.file(entry.archivePath);
    if (!zf) continue;
    const data = await zf.async('arraybuffer');
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
