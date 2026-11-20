import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface ScrubberReferencePin {
  id: string;
  label: string;
  minutes: number; // 0..1439
  color: string;
}

interface DayTimeScrubberProps {
  /** Minutes since local midnight (0..1439) */
  minutes: number;
  timeFormat: '12h' | '24h';
  accentColor?: string;
  referencePins?: ScrubberReferencePin[];
  isUnset?: boolean;
  onChange: (nextMinutes: number) => void;
}

function clampMinutes(mins: number): number {
  return Math.max(0, Math.min(1439, Math.round(mins)));
}

function formatTickHour(hour: number, timeFormat: '12h' | '24h'): string {
  if (timeFormat === '24h') {
    return `${String(hour).padStart(2, '0')}`;
  }
  if (hour === 0 || hour === 24) return '12a';
  if (hour === 12) return '12p';
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

function formatShortMinutes(totalMins: number, timeFormat: '12h' | '24h'): string {
  const clamped = clampMinutes(totalMins);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  if (timeFormat === '24h') {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const DayTimeScrubber: React.FC<DayTimeScrubberProps> = ({
  minutes,
  timeFormat,
  accentColor = 'var(--accent)',
  referencePins = [],
  isUnset = false,
  onChange,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const safeMinutes = clampMinutes(minutes);
  const percent = (safeMinutes / 1439) * 100;

  const computeMinutesFromClientX = useCallback((clientX: number, finePrecision: boolean) => {
    const el = trackRef.current;
    if (!el) return safeMinutes;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return safeMinutes;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const rawMins = ratio * 1439;
    if (finePrecision) {
      return clampMinutes(rawMins);
    }
    // Snap to 5-minute increments for effortless targeting
    return clampMinutes(Math.round(rawMins / 5) * 5);
  }, [safeMinutes]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    const next = computeMinutesFromClientX(e.clientX, e.shiftKey);
    onChange(next);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const next = computeMinutesFromClientX(e.clientX, e.shiftKey);
    onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore if already released
    }
  };

  // Non-passive wheel listener so scrubbing with mouse wheel / trackpad never scrolls the modal
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dominantDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (dominantDelta === 0) return;
      const step = e.shiftKey ? 1 : 5;
      const direction = dominantDelta > 0 ? 1 : -1;
      const snappedBase = e.shiftKey ? safeMinutes : Math.round(safeMinutes / 5) * 5;
      onChange(clampMinutes(snappedBase + direction * step));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [safeMinutes, onChange]);

  const labeledHours = useMemo(() => [0, 3, 6, 9, 12, 15, 18, 21, 24], []);
  const allHours = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []);

  const dayPeriodLabel = useMemo(() => {
    const h = Math.floor(safeMinutes / 60);
    if (h < 5) return 'Late Night';
    if (h < 12) return 'Morning';
    if (h < 17) return 'Afternoon';
    if (h < 21) return 'Evening';
    return 'Night';
  }, [safeMinutes]);

  return (
    <div className="space-y-2 select-none">
      {/* Period context + active drag hint */}
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: 'var(--text-muted)' }}>
          {dayPeriodLabel}
        </span>
        <span className="font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
          Drag or scroll · Shift = 1m
        </span>
      </div>

      {/* Interactive 24-Hour Day Ruler */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Scrub time of day"
        aria-valuemin={0}
        aria-valuemax={1439}
        aria-valuenow={safeMinutes}
        aria-valuetext={formatShortMinutes(safeMinutes, timeFormat)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 1 : 15;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(clampMinutes(safeMinutes + step));
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(clampMinutes(safeMinutes - step));
          }
        }}
        className="relative h-20 rounded-xl border overflow-hidden touch-none cursor-ew-resize outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: isDragging ? accentColor : 'var(--border-subtle)',
        }}
      >
        {/* Subtle 4-band daylight atmosphere (Night · Morning · Afternoon · Evening) */}
        <div aria-hidden="true" className="absolute inset-0 flex pointer-events-none">
          <div
            className="w-1/4 h-full"
            style={{ backgroundColor: 'color-mix(in srgb, var(--text-primary) 4%, transparent)' }}
          />
          <div
            className="w-1/4 h-full"
            style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 5%, transparent)' }}
          />
          <div
            className="w-1/4 h-full"
            style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 4%, transparent)' }}
          />
          <div
            className="w-1/4 h-full"
            style={{ backgroundColor: 'color-mix(in srgb, var(--text-primary) 5%, transparent)' }}
          />
        </div>

        {/* Hour Ticks */}
        <div aria-hidden="true" className="absolute inset-x-3 top-0 bottom-6 pointer-events-none">
          {allHours.map((h) => {
            const leftPct = (h / 24) * 100;
            const isMajor = h % 3 === 0;
            return (
              <div
                key={h}
                className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${leftPct}%` }}
              >
                <div
                  className={isMajor ? 'w-px h-3.5' : 'w-px h-2'}
                  style={{
                    backgroundColor: isMajor
                      ? 'var(--border-strong)'
                      : 'var(--border-subtle)',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Hour Axis Labels */}
        <div
          aria-hidden="true"
          className="absolute inset-x-3 bottom-1.5 h-4 pointer-events-none"
        >
          {labeledHours.map((h) => {
            const leftPct = (h / 24) * 100;
            const alignClass =
              h === 0
                ? 'translate-x-0'
                : h === 24
                ? '-translate-x-full'
                : '-translate-x-1/2';
            return (
              <span
                key={h}
                className={`absolute top-0 text-[10px] font-mono tabular-nums ${alignClass}`}
                style={{ color: 'var(--text-muted)' }}
              >
                {formatTickHour(h, timeFormat)}
              </span>
            );
          })}
        </div>

        {/* Passive Reference Pins for the entry's other timestamps on the same day */}
        <div className="absolute inset-x-3 top-2.5 bottom-6 pointer-events-none">
          {referencePins.map((pin) => {
            const pinPct = (clampMinutes(pin.minutes) / 1439) * 100;
            return (
              <div
                key={pin.id}
                className="absolute inset-y-0 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${pinPct}%` }}
                title={`${pin.label}: ${formatShortMinutes(pin.minutes, timeFormat)}`}
              >
                <span
                  className="w-2 h-2 rounded-full ring-2"
                  style={{
                    backgroundColor: pin.color,
                    boxShadow: '0 0 0 1.5px var(--bg-surface)',
                    opacity: 0.85,
                  }}
                />
                <span
                  className="w-px flex-1 mt-0.5 opacity-45"
                  style={{ backgroundColor: pin.color }}
                />
              </div>
            );
          })}

          {/* Active Scrubbing Needle + Thumb */}
          <div
            className="absolute inset-y-0 -translate-x-1/2 flex flex-col items-center transition-transform duration-75"
            style={{
              left: `${percent}%`,
              opacity: isUnset && !isDragging ? 0.45 : 1,
            }}
          >
            <div
              className="w-3.5 h-3.5 rounded-full border-2 shadow-sm transition-transform"
              style={{
                backgroundColor: accentColor,
                borderColor: 'var(--bg-elevated)',
                transform: isDragging ? 'scale(1.22)' : 'scale(1)',
              }}
            />
            <div
              className="w-0.5 flex-1 -mt-0.5 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
          </div>
        </div>
      </div>

      {/* Reference Pin Legend (only when other timestamps exist on this entry) */}
      {referencePins.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums px-0.5">
          {referencePins.map((pin) => (
            <span
              key={pin.id}
              className="inline-flex items-center gap-1.5"
              style={{ color: 'var(--text-muted)' }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: pin.color }}
              />
              <span>
                {pin.label} {formatShortMinutes(pin.minutes, timeFormat)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
