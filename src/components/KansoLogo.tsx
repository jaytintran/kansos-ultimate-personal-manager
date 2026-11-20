import React, { useId } from 'react';

interface KansoLogoProps {
  size?: number;
  className?: string;
}

/**
 * Kanso signature brand emblem — a Minimal Zen Enso open circle with a
 * centered focus dot in Warm Paper Cream (#FAF8F5) inside a Deep Ink Charcoal
 * (#18181B) rounded squircle framed by a subtle inner hairline.
 * Fixed signature brand colors across all themes for consistent identity.
 */
export const KansoLogo: React.FC<KansoLogoProps> = ({ size = 24, className = '' }) => {
  const gradId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="64"
          y1="24"
          x2="448"
          y2="488"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#222226" />
          <stop offset="55%" stopColor="#18181B" />
          <stop offset="100%" stopColor="#121215" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${gradId})`} />
      <rect
        x="18"
        y="18"
        width="476"
        height="476"
        rx="98"
        stroke="#FAF8F5"
        strokeOpacity="0.16"
        strokeWidth="14"
      />
      <path
        d="M 407.17 240.11 A 152 152 0 1 1 302.97 111.44 A 18.73 18.73 0 0 1 295.76 148.19 A 106 106 0 1 0 368.42 237.92 A 19.40 19.40 0 0 1 407.17 240.11 Z"
        fill="#FAF8F5"
      />
      <circle cx="256" cy="256" r="32" fill="#FAF8F5" />
    </svg>
  );
};
