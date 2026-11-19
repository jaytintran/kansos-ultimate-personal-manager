import {
  AlertTriangle,
  Check,
  FileUp,
  HardDrive,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {libraryDb, type BookFileAuditEntry} from '../../lib/db';
import {formatFileSize, formatShortDate} from '../../lib/formatters';
import type {BookFormat, BookRecord} from '../../types/library';
import {BookCover} from './BookCover';

type StorageSortField = 'sizeDesc' | 'sizeAsc' | 'title' | 'addedAt' | 'format';
type IssueFilter = 'all' | 'duplicates' | 'missing';

interface StorageManagerModalProps {
  isOpen: boolean;
  books: BookRecord[];
  onClose: () => void;
  onReplaceFile: (bookId: string, file: File) => Promise<void>;
  onDeleteBooks: (bookIds: string[]) => Promise<void>;
  onEditMetadata: (book: BookRecord) => void;
  onImportBooks: () => void;
  onNotify: (title: string, tone: 'info' | 'success' | 'error', detail?: string) => void;
}

interface QuotaState {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

export const StorageManagerModal: React.FC<StorageManagerModalProps> = ({
  isOpen,
  books,
  onClose,
  onReplaceFile,
  onDeleteBooks,
  onEditMetadata,
  onImportBooks,
  onNotify,
}) => {
  const [auditEntries, setAuditEntries] = useState<BookFileAuditEntry[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [quota, setQuota] = useState<QuotaState>({usage: null, quota: null, persisted: null});

  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | BookFormat>('all');
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('all');
  const [sortField, setSortField] = useState<StorageSortField>('sizeDesc');

  const [replacingBookId, setReplacingBookId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);

  const replaceTargetBookIdRef = useRef<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const runAudit = useCallback(async () => {
    setIsAuditing(true);
    try {
      const [entries, estimate, persisted] = await Promise.all([
        libraryDb.auditStorageFiles(),
        typeof navigator !== 'undefined' && navigator.storage?.estimate
          ? navigator.storage.estimate().catch(() => null)
          : Promise.resolve(null),
        typeof navigator !== 'undefined' && navigator.storage?.persisted
          ? navigator.storage.persisted().catch(() => null)
          : Promise.resolve(null),
      ]);
      setAuditEntries(entries);
      setQuota({
        usage: typeof estimate?.usage === 'number' ? estimate.usage : null,
        quota: typeof estimate?.quota === 'number' ? estimate.quota : null,
        persisted,
      });
    } catch {
      // Fallback safely to BookRecord.fileSize values if audit fails
    } finally {
      setIsAuditing(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmDeleteId(null);
    void runAudit();
  }, [isOpen, runAudit]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !replacingBookId && !deletingBookId) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, replacingBookId, deletingBookId, onClose]);

  const auditByBookId = useMemo(
    () => new Map(auditEntries.map((entry) => [entry.bookId, entry])),
    [auditEntries]
  );

  const bookIdSet = useMemo(() => new Set(books.map((b) => b.id)), [books]);

  const orphanEntries = useMemo(
    () => auditEntries.filter((entry) => !bookIdSet.has(entry.bookId)),
    [auditEntries, bookIdSet]
  );

  const orphanBytes = useMemo(
    () => orphanEntries.reduce((sum, entry) => sum + entry.byteLength, 0),
    [orphanEntries]
  );

  // Detect exact byte-identical duplicates by SHA-256 hash (oldest book kept as primary reference)
  const duplicatePartnerMap = useMemo(() => {
    const byHash = new Map<string, BookRecord[]>();
    const sortedByAdded = [...books].sort((a, b) => a.addedAt - b.addedAt);
    for (const book of sortedByAdded) {
      const sha = auditByBookId.get(book.id)?.sha256;
      if (!sha) continue;
      const group = byHash.get(sha) ?? [];
      group.push(book);
      byHash.set(sha, group);
    }
    const partnerMap = new Map<string, {primaryTitle: string; countInGroup: number}>();
    for (const group of byHash.values()) {
      if (group.length > 1) {
        const primary = group[0];
        for (const item of group) {
          partnerMap.set(item.id, {
            primaryTitle: item.id === primary.id ? group[1].title : primary.title,
            countInGroup: group.length,
          });
        }
      }
    }
    return partnerMap;
  }, [books, auditByBookId]);

  const missingBookIds = useMemo(() => {
    if (isAuditing || auditEntries.length === 0 && books.length === 0) return new Set<string>();
    if (isAuditing) return new Set<string>();
    const missing = new Set<string>();
    for (const book of books) {
      if (!auditByBookId.has(book.id)) {
        missing.add(book.id);
      }
    }
    return missing;
  }, [books, auditByBookId, isAuditing, auditEntries.length]);

  const getBookBytes = useCallback(
    (book: BookRecord): number => {
      const audited = auditByBookId.get(book.id);
      if (audited) return audited.byteLength;
      return book.fileSize || 0;
    },
    [auditByBookId]
  );

  const formatStats = useMemo(() => {
    const stats: Record<BookFormat, {count: number; bytes: number}> = {
      epub: {count: 0, bytes: 0},
      pdf: {count: 0, bytes: 0},
      mobi: {count: 0, bytes: 0},
    };
    let total = 0;
    for (const book of books) {
      const bytes = getBookBytes(book);
      stats[book.format].count += 1;
      stats[book.format].bytes += bytes;
      total += bytes;
    }
    return {stats, total};
  }, [books, getBookBytes]);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = books.filter((book) => {
      if (formatFilter !== 'all' && book.format !== formatFilter) return false;
      if (issueFilter === 'duplicates' && !duplicatePartnerMap.has(book.id)) return false;
      if (issueFilter === 'missing' && !missingBookIds.has(book.id)) return false;
      if (q) {
        const hay = `${book.title} ${book.subtitle ?? ''} ${book.author} ${book.fileName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortField === 'sizeDesc') return getBookBytes(b) - getBookBytes(a);
      if (sortField === 'sizeAsc') return getBookBytes(a) - getBookBytes(b);
      if (sortField === 'title') return a.title.localeCompare(b.title);
      if (sortField === 'format') return a.format.localeCompare(b.format) || getBookBytes(b) - getBookBytes(a);
      return b.addedAt - a.addedAt;
    });

    return list;
  }, [books, searchQuery, formatFilter, issueFilter, sortField, duplicatePartnerMap, missingBookIds, getBookBytes]);

  useEffect(() => {
    if (issueFilter === 'duplicates' && duplicatePartnerMap.size === 0) {
      setIssueFilter('all');
    }
    if (issueFilter === 'missing' && missingBookIds.size === 0) {
      setIssueFilter('all');
    }
  }, [issueFilter, duplicatePartnerMap.size, missingBookIds.size]);

  if (!isOpen) return null;

  const handleTriggerReplace = (bookId: string) => {
    replaceTargetBookIdRef.current = bookId;
    replaceInputRef.current?.click();
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const targetBookId = replaceTargetBookIdRef.current;
    replaceTargetBookIdRef.current = null;
    if (!file || !targetBookId) return;

    setReplacingBookId(targetBookId);
    try {
      await onReplaceFile(targetBookId, file);
      await runAudit();
    } finally {
      setReplacingBookId(null);
    }
  };

  const handleConfirmDelete = async (bookId: string) => {
    setDeletingBookId(bookId);
    try {
      await onDeleteBooks([bookId]);
      setConfirmDeleteId(null);
      await runAudit();
    } finally {
      setDeletingBookId(null);
    }
  };

  const handleCleanOrphans = async () => {
    if (orphanEntries.length === 0) return;
    setCleaningOrphans(true);
    try {
      await libraryDb.deleteOrphanBookFiles(orphanEntries.map((o) => o.bookId));
      onNotify(
        `Cleaned ${orphanEntries.length} orphaned ${orphanEntries.length === 1 ? 'file' : 'files'}`,
        'success',
        `Freed ${formatFileSize(orphanBytes)}`
      );
      await runAudit();
    } catch (err) {
      onNotify(
        'Could not clean orphaned files',
        'error',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setCleaningOrphans(false);
    }
  };

  const quotaPct =
    quota.quota && quota.quota > 0
      ? Math.min(100, Math.max(0.5, ((quota.usage ?? formatStats.total) / quota.quota) * 100))
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-4"
      onClick={() => {
        if (!replacingBookId && !deletingBookId) onClose();
      }}
    >
      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf,.epub,.mobi,.prc,.azw"
        onChange={(e) => void handleFileChosen(e)}
        className="hidden"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Storage and Book Files Manager"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[88vh] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <HardDrive className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-serif-editorial text-lg font-semibold text-[var(--text-primary)]">
                Storage &amp; Book Files
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] font-mono-tabular">
                {books.length} {books.length === 1 ? 'book' : 'books'} ·{' '}
                {formatFileSize(formatStats.total)} in local archive
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={Boolean(replacingBookId || deletingBookId)}
            onClick={onClose}
            aria-label="Close storage manager"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Storage Quota & Format Breakdown */}
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3 shrink-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium text-[var(--text-primary)]">Browser Storage</span>
              {quota.quota !== null && quota.usage !== null ? (
                <span className="font-mono-tabular text-[var(--text-secondary)]">
                  {formatFileSize(quota.usage)} used of {formatFileSize(quota.quota)}
                </span>
              ) : (
                <span className="font-mono-tabular text-[var(--text-secondary)]">
                  {formatFileSize(formatStats.total)} archived
                </span>
              )}
              {quota.persisted !== null && (
                <span className="text-[11px] text-[var(--text-muted)]">
                  · {quota.persisted ? 'Persistent storage granted' : 'Standard browser quota'}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono-tabular text-[var(--text-secondary)]">
              <span>
                EPUB · {formatStats.stats.epub.count} ({formatFileSize(formatStats.stats.epub.bytes)})
              </span>
              <span aria-hidden="true" className="text-[var(--text-muted)]">
                /
              </span>
              <span>
                PDF · {formatStats.stats.pdf.count} ({formatFileSize(formatStats.stats.pdf.bytes)})
              </span>
              <span aria-hidden="true" className="text-[var(--text-muted)]">
                /
              </span>
              <span>
                MOBI · {formatStats.stats.mobi.count} ({formatFileSize(formatStats.stats.mobi.bytes)})
              </span>
            </div>
          </div>

          {quotaPct !== null && (
            <div className="h-1.5 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                style={{width: `${quotaPct}%`}}
              />
            </div>
          )}

          {/* Conditional Health Findings (only shown when real duplicates, missing blobs, or orphans exist) */}
          {(duplicatePartnerMap.size > 0 || missingBookIds.size > 0 || orphanEntries.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-xs">
              {duplicatePartnerMap.size > 0 && (
                <div className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>
                    <strong className="font-mono-tabular text-[var(--text-primary)]">
                      {duplicatePartnerMap.size}
                    </strong>{' '}
                    books share identical file bytes
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setIssueFilter((prev) => (prev === 'duplicates' ? 'all' : 'duplicates'))
                    }
                    className="text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    {issueFilter === 'duplicates' ? 'Show All' : 'Filter Duplicates'}
                  </button>
                </div>
              )}

              {missingBookIds.size > 0 && (
                <div className="inline-flex items-center gap-2 text-[var(--danger)]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    <strong className="font-mono-tabular">{missingBookIds.size}</strong>{' '}
                    {missingBookIds.size === 1 ? 'book is' : 'books are'} missing file data
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setIssueFilter((prev) => (prev === 'missing' ? 'all' : 'missing'))
                    }
                    className="text-[11px] font-medium underline cursor-pointer whitespace-nowrap"
                  >
                    {issueFilter === 'missing' ? 'Show All' : 'Show Missing'}
                  </button>
                </div>
              )}

              {orphanEntries.length > 0 && (
                <div className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
                  <span>
                    <strong className="font-mono-tabular text-[var(--text-primary)]">
                      {orphanEntries.length}
                    </strong>{' '}
                    orphaned {orphanEntries.length === 1 ? 'blob' : 'blobs'} (
                    {formatFileSize(orphanBytes)})
                  </span>
                  <button
                    type="button"
                    disabled={cleaningOrphans}
                    onClick={() => void handleCleanOrphans()}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3 h-3" />
                    {cleaningOrphans ? 'Cleaning…' : 'Clean Up'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search, Format Filter & Sort Controls */}
        {books.length > 0 && (
          <div className="px-5 sm:px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by title, author, or file..."
                  aria-label="Filter stored book files"
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear file filter"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div
                role="group"
                aria-label="Filter files by format"
                className="inline-flex items-center p-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-sidebar)]"
              >
                {(['all', 'epub', 'pdf', 'mobi'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormatFilter(fmt)}
                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      formatFilter === fmt
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {fmt === 'all' ? 'All' : fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {issueFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setIssueFilter('all')}
                  className="px-2.5 py-1.5 text-[11px] font-medium rounded-md border border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)] cursor-pointer whitespace-nowrap"
                >
                  {issueFilter === 'duplicates' ? 'Showing Duplicates ×' : 'Showing Missing ×'}
                </button>
              )}

              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as StorageSortField)}
                aria-label="Sort book files"
                className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] cursor-pointer"
              >
                <option value="sizeDesc">Largest first</option>
                <option value="sizeAsc">Smallest first</option>
                <option value="title">Title (A–Z)</option>
                <option value="format">Format</option>
                <option value="addedAt">Recently added</option>
              </select>
            </div>
          </div>
        )}

        {/* Book Files List */}
        <div className="flex-1 overflow-y-auto">
          {isAuditing && auditEntries.length === 0 && books.length > 0 ? (
            <div className="divide-y divide-[var(--border-subtle)]">
              {Array.from({length: Math.min(5, books.length)}).map((_, idx) => (
                <div key={idx} className="px-5 sm:px-6 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-11 rounded bg-[var(--bg-surface)] shrink-0 animate-pulse" />
                    <div className="space-y-1.5 flex-1 max-w-sm">
                      <div className="h-3.5 w-2/3 rounded bg-[var(--bg-surface)] animate-pulse" />
                      <div className="h-3 w-1/2 rounded bg-[var(--bg-surface)] animate-pulse" />
                    </div>
                  </div>
                  <div className="h-4 w-16 rounded bg-[var(--bg-surface)] animate-pulse shrink-0" />
                </div>
              ))}
            </div>
          ) : books.length === 0 ? (
            <div className="py-16 px-6 text-center space-y-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Your local archive is empty
              </p>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                Import EPUB, PDF, or MOBI files to store them offline in this browser and manage their file sizes here.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onImportBooks();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                Import Books
              </button>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="py-14 px-6 text-center space-y-2.5">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                No stored files match your filter
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFormatFilter('all');
                  setIssueFilter('all');
                }}
                className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {filteredBooks.map((book) => {
                const bytes = getBookBytes(book);
                const sharePct =
                  formatStats.total > 0 ? Math.round((bytes / formatStats.total) * 100) : 0;
                const duplicateInfo = duplicatePartnerMap.get(book.id);
                const isMissing = missingBookIds.has(book.id);
                const isReplacing = replacingBookId === book.id;
                const isConfirmingDelete = confirmDeleteId === book.id;
                const isDeleting = deletingBookId === book.id;

                return (
                  <div
                    key={book.id}
                    className="px-5 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--bg-surface-hover)]/60 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 shrink-0">
                        <BookCover
                          title={book.title}
                          author={book.author}
                          format={book.format}
                          coverDataUrl={book.coverDataUrl}
                          paletteIndex={book.coverPaletteIndex}
                          coverStyle={book.coverStyle}
                          size="sm"
                        />
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {book.title}
                          </span>
                          {book.subtitle?.trim() && (
                            <span className="hidden md:inline text-[11px] text-[var(--text-secondary)] truncate">
                              · {book.subtitle}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-secondary)]">
                          <span className="truncate max-w-[180px]">{book.author}</span>
                          <span aria-hidden="true" className="text-[var(--text-muted)]">
                            ·
                          </span>
                          <span
                            title={book.fileName}
                            className="font-mono-tabular text-[var(--text-muted)] truncate max-w-[220px]"
                          >
                            {book.fileName}
                          </span>
                          <span aria-hidden="true" className="text-[var(--text-muted)]">
                            ·
                          </span>
                          <span className="font-mono-tabular uppercase text-[var(--text-secondary)]">
                            {book.format}
                          </span>
                          <span className="hidden sm:inline text-[var(--text-muted)]">
                            · Added {formatShortDate(book.addedAt)}
                          </span>
                        </div>

                        {(duplicateInfo || isMissing) && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] pt-0.5">
                            {isMissing && (
                              <span className="inline-flex items-center gap-1 text-[var(--danger)] font-medium">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                File data missing — use Replace File to restore
                              </span>
                            )}
                            {duplicateInfo && (
                              <span className="inline-flex items-center gap-1 text-[var(--accent)]">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                Identical bytes to &ldquo;{duplicateInfo.primaryTitle}&rdquo;
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-11 sm:pl-0">
                      <div className="text-left sm:text-right min-w-[74px]">
                        <div className="text-xs font-mono-tabular font-semibold text-[var(--text-primary)]">
                          {isMissing ? '0 B' : formatFileSize(bytes)}
                        </div>
                        {formatStats.total > 0 && !isMissing && (
                          <div className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                            {sharePct < 1 && bytes > 0 ? '<1%' : `${sharePct}%`} of library
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={Boolean(replacingBookId || deletingBookId)}
                          onClick={() => handleTriggerReplace(book.id)}
                          title="Replace stored file (e.g., compressed PDF or EPUB) while preserving metadata and notes"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--accent)] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <FileUp className="w-3 h-3 text-[var(--accent)] shrink-0" />
                          <span>{isReplacing ? 'Replacing…' : 'Replace File'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={Boolean(replacingBookId || deletingBookId)}
                          onClick={() => onEditMetadata(book)}
                          title="Edit metadata"
                          aria-label={`Edit metadata for ${book.title}`}
                          className="p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => void handleConfirmDelete(book.id)}
                              title="Confirm delete book"
                              className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-md bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              <Check className="w-3 h-3" />
                              <span>{isDeleting ? 'Deleting…' : 'Confirm'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label="Cancel delete"
                              className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={Boolean(replacingBookId || deletingBookId)}
                            onClick={() => setConfirmDeleteId(book.id)}
                            title="Delete book from local storage"
                            aria-label={`Delete ${book.title}`}
                            className="p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--danger)] hover:border-[var(--danger)]/50 disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-[var(--text-secondary)]">
            Replacing a file keeps all metadata, covers, folders, bookmarks, and highlights intact.
          </p>
          <button
            type="button"
            disabled={Boolean(replacingBookId || deletingBookId)}
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
