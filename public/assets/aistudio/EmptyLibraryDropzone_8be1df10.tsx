import {BookUp, FolderOpen} from 'lucide-react';
import React, {useState} from 'react';

interface EmptyLibraryDropzoneProps {
  onFilesSelected: (files: FileList | File[]) => void;
  onBrowseClick: () => void;
  isImporting: boolean;
}

export const EmptyLibraryDropzone: React.FC<EmptyLibraryDropzoneProps> = ({
  onFilesSelected,
  onBrowseClick,
  isImporting,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8 lg:p-14">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full max-w-2xl rounded-xl border border-dashed transition-colors px-8 py-16 md:px-14 md:py-20 text-center ${
          isDragOver
            ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)]'
            : 'border-[var(--border-strong)] bg-[var(--bg-surface)]'
        }`}
      >
        <div className="mx-auto w-12 h-12 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-center mb-6">
          <BookUp className="w-5 h-5 text-[var(--accent)]" />
        </div>

        <h1 className="font-serif-editorial text-2xl md:text-3xl font-semibold tracking-tight text-[var(--text-primary)] [text-wrap:balance]">
          Your offline reading room awaits
        </h1>

        <p className="mt-3 max-w-md mx-auto text-sm leading-relaxed text-[var(--text-secondary)]">
          Drop digital books here to store them privately on this device. Organize with folders,
          categories, and tags, and read distraction-free in Sepia or Dark mode.
        </p>

        <div className="mt-8 flex items-center justify-center">
          <button
            type="button"
            disabled={isImporting}
            onClick={onBrowseClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span>{isImporting ? 'Importing Books...' : 'Import Books'}</span>
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
          <span className="font-mono-tabular text-[var(--text-secondary)]">PDF</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular text-[var(--text-secondary)]">EPUB</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular text-[var(--text-secondary)]">MOBI</span>
          <span aria-hidden="true">·</span>
          <span>Multi-file batch import</span>
          <span aria-hidden="true">·</span>
          <span>Stored locally in IndexedDB</span>
        </div>
      </div>
    </div>
  );
};
