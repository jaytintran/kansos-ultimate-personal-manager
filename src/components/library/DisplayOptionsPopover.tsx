import React from 'react';
import type {CardDetailOptions, CoverSize} from '../../types/library';

interface DisplayOptionsPopoverProps {
  coverSize: CoverSize;
  cardDetails: CardDetailOptions;
  onCoverSizeChange: (size: CoverSize) => void;
  onCardDetailsChange: (patch: Partial<CardDetailOptions>) => void;
}

const COVER_SIZE_STEPS: CoverSize[] = ['compact', 'standard', 'large'];

export const DisplayOptionsPopover: React.FC<DisplayOptionsPopoverProps> = ({
  coverSize,
  cardDetails,
  onCoverSizeChange,
  onCardDetailsChange,
}) => {
  const sizeIndex = Math.max(0, COVER_SIZE_STEPS.indexOf(coverSize));

  return (
    <div
      role="dialog"
      aria-label="Catalog display options"
      className="w-72 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-xl p-4 space-y-4 text-xs"
    >
      {/* Cover Size Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[var(--text-primary)]">Cover Size</span>
          <span className="font-mono-tabular text-[11px] text-[var(--text-secondary)] capitalize">
            {coverSize}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={2}
          step={1}
          value={sizeIndex}
          onChange={(e) => {
            const next = COVER_SIZE_STEPS[Number(e.target.value)] ?? 'standard';
            onCoverSizeChange(next);
          }}
          aria-label="Cover size slider"
          className="w-full accent-[var(--accent)] cursor-pointer"
        />

        <div className="grid grid-cols-3 gap-1">
          {COVER_SIZE_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => onCoverSizeChange(step)}
              className={`py-1 text-[11px] rounded border transition-colors capitalize cursor-pointer ${
                coverSize === step
                  ? 'border-[var(--accent)] bg-[var(--bg-accent-subtle)] text-[var(--accent)] font-medium'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {step}
            </button>
          ))}
        </div>
      </div>

      {/* Toggleable Card Details */}
      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
        <span className="block font-medium text-[var(--text-primary)]">Card Details</span>
        <div className="space-y-1.5">
          {(
            [
              {key: 'subtitle', label: 'Subtitle'},
              {key: 'author', label: 'Author name'},
              {key: 'format', label: 'File format (EPUB, PDF, MOBI)'},
              {key: 'category', label: 'Category label'},
              {key: 'progress', label: 'Reading progress bar & %'},
              {key: 'tags', label: 'Tags summary'},
            ] as const
          ).map((item) => (
            <label
              key={item.key}
              className="flex items-center justify-between gap-2 py-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <span>{item.label}</span>
              <input
                type="checkbox"
                checked={cardDetails[item.key]}
                onChange={(e) => onCardDetailsChange({[item.key]: e.target.checked})}
                className="w-3.5 h-3.5 accent-[var(--accent)] rounded cursor-pointer"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
