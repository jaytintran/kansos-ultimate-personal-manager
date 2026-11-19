import {ArrowUpRight, BookMarked, X} from 'lucide-react';
import React, {useEffect} from 'react';

export interface FootnotePreviewState {
  title: string;
  html: string;
  targetChapterIndex: number;
  anchorId?: string;
  x: number;
  y: number;
}

interface FootnotePopoverProps {
  footnote: FootnotePreviewState | null;
  onJumpToSource: (chapterIndex: number, anchorId?: string) => void;
  onClose: () => void;
}

export const FootnotePopover: React.FC<FootnotePopoverProps> = ({
  footnote,
  onJumpToSource,
  onClose,
}) => {
  useEffect(() => {
    if (!footnote) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [footnote, onClose]);

  if (!footnote) return null;

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768;
  const cardWidth = Math.min(400, viewportW - 24);
  const left = Math.min(Math.max(12, footnote.x - cardWidth / 2), viewportW - cardWidth - 12);
  const placeBelow = footnote.y < viewportH * 0.48;
  const top = placeBelow
    ? Math.min(viewportH - 220, footnote.y + 16)
    : Math.max(64, footnote.y - 16);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Footnote preview"
        onClick={(e) => e.stopPropagation()}
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${cardWidth}px`,
          transform: placeBelow ? 'none' : 'translateY(-100%)',
        }}
        className="fixed z-50 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-xl overflow-hidden animate-folio-sheet-up"
      >
        <div className="px-3.5 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)] truncate">
            <BookMarked className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span className="truncate">{footnote.title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close footnote"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          className="px-4 py-3 max-h-56 overflow-y-auto folio-prose font-serif-editorial text-sm leading-relaxed text-[var(--text-primary)]"
          dangerouslySetInnerHTML={{__html: footnote.html}}
        />

        <div className="px-3.5 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onJumpToSource(footnote.targetChapterIndex, footnote.anchorId)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] cursor-pointer"
          >
            <span>Jump to note in book</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
};
