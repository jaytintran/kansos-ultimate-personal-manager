import React from 'react';

interface KansoLogoProps {
  size?: number;
  className?: string;
}

/**
 * Kanso brand emblem — a minimalist Hanko-inspired squircle pairing a vertical
 * timeline spine with a detached geometric chevron forming a calm "K".
 * Automatically adapts to all 10 Kanso palettes via CSS custom properties.
 */
export const KansoLogo: React.FC<KansoLogoProps> = ({ size = 24, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <rect x="9.25" y="8.125" width="3" height="15.75" rx="1.5" fill="var(--accent-fg)" />
      <path
        d="M21.375 9.625L15.125 16L21.375 22.375"
        stroke="var(--accent-fg)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
