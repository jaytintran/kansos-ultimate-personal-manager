import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Search, X } from 'lucide-react';
import {
  DynamicIcon,
  ICON_CATEGORIES,
  IconCategoryId,
  resolveIconKey,
  SHARED_ICON_CATALOG,
} from './IconLibrary';

interface IconPickerProps {
  value?: string | null;
  onChange: (iconKey: string) => void;
  onClear?: () => void;
  allowClear?: boolean;
  clearLabel?: string;
  accentColor?: string;
  compact?: boolean;
  autoFocusSearch?: boolean;
  maxGridHeightClass?: string;
}

export const IconPicker: React.FC<IconPickerProps> = ({
  value,
  onChange,
  onClear,
  allowClear = false,
  clearLabel = 'Default',
  accentColor,
  compact = false,
  autoFocusSearch = false,
  maxGridHeightClass = 'max-h-[210px]',
}) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | IconCategoryId>('all');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocusSearch) {
      const id = window.setTimeout(() => searchInputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
  }, [autoFocusSearch]);

  const normalizedValue = value ? resolveIconKey(value, '') : '';

  const filteredIcons = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SHARED_ICON_CATALOG.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.keywords.some((kw) => kw.toLowerCase().includes(q))
      );
    });
  }, [query, activeCategory]);

  const activeAccent = accentColor || 'var(--accent)';
  const activeBg = accentColor ? `${accentColor}20` : 'var(--accent-soft)';

  return (
    <div className="space-y-2.5 min-w-0">
      {/* Search + Optional Clear */}
      <div className="flex items-center gap-1.5">
        <div
          className="relative flex-1 min-w-0 flex items-center rounded-lg border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <Search
            className="w-3.5 h-3.5 ml-2.5 shrink-0"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 60 icons..."
            className="w-full h-8 px-2 bg-transparent text-xs outline-none placeholder:opacity-60"
            style={{ color: 'var(--text-primary)' }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear icon search"
              className="w-6 h-6 mr-1 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {allowClear && onClear && (
          <button
            type="button"
            onClick={onClear}
            title={`Reset to ${clearLabel.toLowerCase()} icon`}
            className="h-8 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 shrink-0 whitespace-nowrap transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <RotateCcw className="w-3 h-3" />
            <span>{clearLabel}</span>
          </button>
        )}
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className="h-6 px-2 rounded-md text-[11px] font-medium shrink-0 whitespace-nowrap transition-colors cursor-pointer"
          style={{
            backgroundColor:
              activeCategory === 'all' ? 'var(--accent-soft)' : 'transparent',
            color:
              activeCategory === 'all' ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          All
        </button>
        {ICON_CATEGORIES.map((cat) => {
          const active = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              title={cat.label}
              className="h-6 px-2 rounded-md text-[11px] font-medium shrink-0 whitespace-nowrap transition-colors cursor-pointer"
              style={{
                backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {cat.shortLabel}
            </button>
          );
        })}
      </div>

      {/* Curated Icon Grid */}
      <div className={`${maxGridHeightClass} overflow-y-auto overscroll-contain pr-0.5`}>
        {filteredIcons.length === 0 ? (
          <div
            className="py-6 text-center text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            No matching icons for "{query}"
          </div>
        ) : (
          <div
            className={`grid ${
              compact ? 'grid-cols-6 gap-1.5' : 'grid-cols-6 sm:grid-cols-8 gap-1.5'
            }`}
          >
            {filteredIcons.map((item) => {
              const selected = normalizedValue === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChange(item.key)}
                  title={`${item.label} (${item.key})`}
                  aria-label={item.label}
                  aria-pressed={selected}
                  className="h-8 w-full flex items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{
                    backgroundColor: selected ? activeBg : 'var(--bg-surface)',
                    borderColor: selected ? activeAccent : 'var(--border-subtle)',
                    color: selected ? activeAccent : 'var(--text-secondary)',
                  }}
                >
                  <DynamicIcon name={item.key} className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

interface IconPickerPopoverProps {
  open: boolean;
  onClose: () => void;
  value?: string | null;
  onChange: (iconKey: string) => void;
  onClear?: () => void;
  allowClear?: boolean;
  clearLabel?: string;
  accentColor?: string;
  align?: 'left' | 'right';
  widthClass?: string;
  title?: string;
}

export const IconPickerPopover: React.FC<IconPickerPopoverProps> = ({
  open,
  onClose,
  value,
  onChange,
  onClear,
  allowClear = false,
  clearLabel = 'Default',
  accentColor,
  align = 'left',
  widthClass = 'w-[288px] sm:w-[316px]',
  title = 'Choose Icon',
}) => {
  const placeholderRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    const updatePosition = () => {
      const anchor = placeholderRef.current?.parentElement;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const popWidth = containerRef.current?.offsetWidth || (window.innerWidth >= 640 ? 316 : 288);
      const popHeight = containerRef.current?.offsetHeight || 340;
      const margin = 12;

      let left = align === 'right' ? rect.right - popWidth : rect.left;
      left = Math.max(margin, Math.min(left, window.innerWidth - popWidth - margin));

      let top = rect.bottom + 6;
      if (top + popHeight > window.innerHeight - margin && rect.top - popHeight - 6 >= margin) {
        top = rect.top - popHeight - 6;
      } else {
        top = Math.max(margin, Math.min(top, window.innerHeight - popHeight - margin));
      }

      setCoords({ top, left });
    };

    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const targetNode = e.target as Node;
      if (containerRef.current?.contains(targetNode)) return;
      if (placeholderRef.current?.parentElement?.contains(targetNode)) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      <span ref={placeholderRef} className="hidden" aria-hidden="true" />
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={containerRef}
            role="dialog"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            className={`fixed z-[90] ${widthClass} rounded-xl border p-3`}
            style={{
              top: coords ? `${coords.top}px` : '-9999px',
              left: coords ? `${coords.left}px` : '-9999px',
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-strong)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                {title}
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close icon picker"
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <IconPicker
              value={value}
              onChange={(iconKey) => {
                onChange(iconKey);
                onClose();
              }}
              onClear={
                onClear
                  ? () => {
                      onClear();
                      onClose();
                    }
                  : undefined
              }
              allowClear={allowClear}
              clearLabel={clearLabel}
              accentColor={accentColor}
              compact
              autoFocusSearch
              maxGridHeightClass="max-h-[196px]"
            />
          </div>,
          document.body,
        )}
    </>
  );
};
