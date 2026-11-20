import React, { useCallback, useMemo, useRef, useState } from 'react';

interface RadialClockPickerProps {
  /** Minutes since local midnight (0..1439) */
  minutes: number;
  timeFormat: '12h' | '24h';
  accentColor?: string;
  onChange: (nextMinutes: number) => void;
}

type ClockFace = 'hours' | 'minutes';

const SIZE = 212;
const CENTER = SIZE / 2;
const OUTER_RADIUS = 80;
const INNER_RADIUS = 50;

function polarToCartesian(radius: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(rad),
    y: CENTER + radius * Math.sin(rad),
  };
}

export const RadialClockPicker: React.FC<RadialClockPickerProps> = ({
  minutes,
  timeFormat,
  accentColor = 'var(--accent)',
  onChange,
}) => {
  const [face, setFace] = useState<ClockFace>('hours');
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const clamped = Math.max(0, Math.min(1439, Math.round(minutes)));
  const currentHour24 = Math.floor(clamped / 60);
  const currentMinute = clamped % 60;
  const isPM = currentHour24 >= 12;

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * SIZE - CENTER;
      const y = ((clientY - rect.top) / rect.height) * SIZE - CENTER;
      const dist = Math.hypot(x, y);

      // Angle where 0° is 12 o'clock and increases clockwise (0..360)
      let deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
      if (deg < 0) deg += 360;

      if (face === 'hours') {
        const sector = Math.round(deg / 30) % 12; // 0 => 12 o'clock, 1..11 => 1..11
        if (timeFormat === '12h') {
          const hour12 = sector === 0 ? 12 : sector;
          const nextHour24 = isPM
            ? hour12 === 12
              ? 12
              : hour12 + 12
            : hour12 === 12
            ? 0
            : hour12;
          onChange(nextHour24 * 60 + currentMinute);
        } else {
          // 24h dial: outer ring = 1..12, inner ring = 13..23, 00
          const isInner = dist < (OUTER_RADIUS + INNER_RADIUS) / 2;
          let nextHour24: number;
          if (isInner) {
            nextHour24 = sector === 0 ? 0 : sector + 12;
          } else {
            nextHour24 = sector === 0 ? 12 : sector;
          }
          onChange(nextHour24 * 60 + currentMinute);
        }
      } else {
        const nextMinute = Math.round(deg / 6) % 60;
        onChange(currentHour24 * 60 + nextMinute);
      }
    },
    [face, timeFormat, isPM, currentHour24, currentMinute, onChange]
  );

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    // Smoothly advance from Hours face to Minutes face on release
    if (face === 'hours') {
      setFace('minutes');
    }
  };

  // Compute hand geometry
  const hand = useMemo(() => {
    if (face === 'hours') {
      const sector = currentHour24 % 12;
      const angle = sector * 30;
      const useInner =
        timeFormat === '24h' && (currentHour24 === 0 || currentHour24 >= 13);
      const r = useInner ? INNER_RADIUS : OUTER_RADIUS;
      return {
        angle,
        radius: r,
        tip: polarToCartesian(r, angle),
      };
    }
    const angle = currentMinute * 6;
    return {
      angle,
      radius: OUTER_RADIUS,
      tip: polarToCartesian(OUTER_RADIUS, angle),
    };
  }, [face, currentHour24, currentMinute, timeFormat]);

  const outerNumbers = useMemo(() => {
    if (face === 'minutes') {
      return Array.from({ length: 12 }, (_, idx) => {
        const val = idx * 5;
        return {
          key: val,
          label: String(val).padStart(2, '0'),
          angle: idx * 30,
          selected: currentMinute === val,
        };
      });
    }
    return Array.from({ length: 12 }, (_, idx) => {
      const hour12 = idx === 0 ? 12 : idx;
      const selected =
        timeFormat === '12h'
          ? (currentHour24 % 12 === 0 ? 12 : currentHour24 % 12) === hour12
          : currentHour24 === hour12;
      return {
        key: hour12,
        label: String(hour12),
        angle: idx * 30,
        selected,
      };
    });
  }, [face, timeFormat, currentHour24, currentMinute]);

  const inner24Numbers = useMemo(() => {
    if (face !== 'hours' || timeFormat !== '24h') return [];
    return Array.from({ length: 12 }, (_, idx) => {
      const hourVal = idx === 0 ? 0 : idx + 12;
      return {
        key: hourVal,
        label: String(hourVal).padStart(2, '0'),
        angle: idx * 30,
        selected: currentHour24 === hourVal,
      };
    });
  }, [face, timeFormat, currentHour24]);

  return (
    <div className="flex flex-col items-center gap-2.5 select-none">
      {/* Face switcher */}
      <div className="w-full flex items-center justify-between text-[11px]">
        <div
          className="inline-flex items-center p-0.5 rounded-lg border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => setFace('hours')}
            className="h-6 px-2.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: face === 'hours' ? 'var(--accent-soft)' : 'transparent',
              color: face === 'hours' ? accentColor : 'var(--text-secondary)',
            }}
          >
            Hours
          </button>
          <button
            type="button"
            onClick={() => setFace('minutes')}
            className="h-6 px-2.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: face === 'minutes' ? 'var(--accent-soft)' : 'transparent',
              color: face === 'minutes' ? accentColor : 'var(--text-secondary)',
            }}
          >
            Minutes
          </button>
        </div>

        <span style={{ color: 'var(--text-muted)' }}>
          {face === 'hours'
            ? timeFormat === '24h'
              ? 'Outer 1–12 · Inner 13–00'
              : 'Drag or click hour'
            : 'Drag or click minute'}
        </span>
      </div>

      {/* Circular SVG Dial */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-[208px] h-[208px] touch-none cursor-pointer"
        role="group"
        aria-label={face === 'hours' ? 'Select hour on radial clock' : 'Select minute on radial clock'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Outer Dial Surface */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={CENTER - 3}
          fill="var(--bg-surface)"
          stroke="var(--border-subtle)"
          strokeWidth={1.25}
        />

        {/* Subtle 60-tick minute ring when on minutes face */}
        {face === 'minutes' &&
          Array.from({ length: 60 }, (_, idx) => {
            if (idx % 5 === 0) return null;
            const p1 = polarToCartesian(OUTER_RADIUS + 11, idx * 6);
            const p2 = polarToCartesian(OUTER_RADIUS + 14, idx * 6);
            return (
              <line
                key={idx}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="var(--border-subtle)"
                strokeWidth={1}
              />
            );
          })}

        {/* Clock Hand Line */}
        <line
          x1={CENTER}
          y1={CENTER}
          x2={hand.tip.x}
          y2={hand.tip.y}
          stroke={accentColor}
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Active Knob Circle */}
        <circle
          cx={hand.tip.x}
          cy={hand.tip.y}
          r={face === 'minutes' && currentMinute % 5 !== 0 ? 11 : 15}
          fill={accentColor}
        />

        {/* Subtle white dot inside minute knob when between 5-minute marks */}
        {face === 'minutes' && currentMinute % 5 !== 0 && (
          <circle cx={hand.tip.x} cy={hand.tip.y} r={2.5} fill="var(--bg-elevated)" />
        )}

        {/* Center Pivot */}
        <circle cx={CENTER} cy={CENTER} r={3.5} fill={accentColor} />

        {/* Outer Ring Labels */}
        {outerNumbers.map((item) => {
          const pos = polarToCartesian(OUTER_RADIUS, item.angle);
          return (
            <text
              key={item.key}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="font-mono text-[12px] font-medium pointer-events-none"
              style={{
                fill: item.selected ? 'var(--accent-fg, #ffffff)' : 'var(--text-primary)',
                fontWeight: item.selected ? 600 : 500,
              }}
            >
              {item.label}
            </text>
          );
        })}

        {/* Inner Ring Labels (24h hours mode) */}
        {inner24Numbers.map((item) => {
          const pos = polarToCartesian(INNER_RADIUS, item.angle);
          return (
            <text
              key={item.key}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="font-mono text-[10.5px] pointer-events-none"
              style={{
                fill: item.selected ? 'var(--accent-fg, #ffffff)' : 'var(--text-muted)',
                fontWeight: item.selected ? 600 : 400,
              }}
            >
              {item.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
};
