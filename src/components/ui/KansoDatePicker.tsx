import React, { useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import "react-day-picker/style.css";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  addDaysToKey,
  formatCompactDayHeading,
  getTodayKey,
  parseLocalDateKey,
  toLocalDateKey,
} from "../../utils/date";

interface KansoCalendarPanelProps {
  value: string; // YYYY-MM-DD or ""
  onSelectDate: (dateKey: string | null) => void;
  compact?: boolean;
}

export const KansoCalendarPanel: React.FC<KansoCalendarPanelProps> = ({
  value,
  onSelectDate,
  compact = false,
}) => {
  const todayKey = getTodayKey();
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const nextWeekKey = addDaysToKey(todayKey, 7);

  const selectedDate = value ? parseLocalDateKey(value) : undefined;
  const [month, setMonth] = useState<Date>(() =>
    selectedDate ?? parseLocalDateKey(todayKey),
  );

  useEffect(() => {
    if (value) {
      setMonth(parseLocalDateKey(value));
    }
  }, [value]);

  return (
    <div className={compact ? "space-y-2" : "space-y-2.5"}>
      {/* Quick preset chips */}
      <div className="grid grid-cols-4 gap-1">
        {[
          { label: "Today", key: todayKey },
          { label: "Tmrw", key: tomorrowKey },
          { label: "+7d", key: nextWeekKey },
        ].map((preset) => {
          const active = value === preset.key;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onSelectDate(preset.key)}
              className="h-7 rounded-lg text-[11px] font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                backgroundColor: active
                  ? "var(--accent-soft)"
                  : "var(--bg-surface)",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`,
              }}
            >
              {preset.label}
            </button>
          );
        })}

        <button
          type="button"
          disabled={!value}
          onClick={() => onSelectDate(null)}
          className="h-7 rounded-lg text-[11px] font-medium transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: value ? "var(--danger)" : "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          Clear
        </button>
      </div>

      {/* Theme-integrated DayPicker */}
      <DayPicker
        mode="single"
        selected={selectedDate}
        month={month}
        onMonthChange={setMonth}
        showOutsideDays
        onSelect={(day) => {
          if (day) {
            onSelectDate(toLocalDateKey(day));
          }
        }}
        components={{
          Chevron: ({ orientation }) =>
            orientation === "left" ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            ),
        }}
        classNames={{
          root: "w-full select-none",
          months: "relative flex flex-col",
          month: "w-full space-y-2",
          month_caption: "flex items-center justify-center relative h-7",
          caption_label:
            "font-display text-xs sm:text-sm font-semibold text-[var(--text-primary)]",
          nav: "flex items-center justify-between absolute inset-x-0 top-0 h-7 pointer-events-none z-10",
          button_previous:
            "pointer-events-auto h-7 w-7 inline-flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer",
          button_next:
            "pointer-events-auto h-7 w-7 inline-flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer",
          month_grid: "w-full border-collapse",
          weekdays: "grid grid-cols-7 mb-1",
          weekday:
            "text-center text-[11px] font-medium text-[var(--text-muted)] py-0.5",
          weeks: "space-y-0.5",
          week: "grid grid-cols-7",
          day: "flex items-center justify-center p-0.5",
          day_button:
            "w-8 h-7 rounded-lg font-mono tabular-nums text-xs flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] cursor-pointer",
          selected:
            "[&>button]:bg-[var(--accent)] [&>button]:text-[var(--accent-fg)] [&>button]:font-semibold [&>button]:hover:bg-[var(--accent)]",
          today:
            "[&>button]:ring-1 [&>button]:ring-[var(--accent)] [&>button]:text-[var(--accent)] [&>button]:font-semibold",
          outside: "[&>button]:opacity-35",
          disabled: "[&>button]:opacity-25 [&>button]:cursor-not-allowed",
        }}
      />
    </div>
  );
};

interface KansoDatePopoverProps {
  value: string; // YYYY-MM-DD or ""
  onChange: (dateKey: string) => void;
  placeholder?: string;
  align?: "left" | "right";
  openUpwards?: boolean;
  fullWidth?: boolean;
}

export const KansoDatePopover: React.FC<KansoDatePopoverProps> = ({
  value,
  onChange,
  placeholder = "Set due date",
  align = "left",
  openUpwards = false,
  fullWidth = false,
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const todayKey = getTodayKey();
  const isOverdue = Boolean(value && value < todayKey);

  return (
    <div className={`relative ${fullWidth ? "w-full" : "inline-flex items-center"}`}>
      <div className="flex items-center gap-1 min-w-0 w-full">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 -mx-1 text-xs font-medium transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer ${
            fullWidth ? "flex-1 min-w-0 justify-between" : ""
          }`}
          style={{
            backgroundColor: open ? "var(--bg-surface-hover)" : undefined,
            color: value
              ? isOverdue
                ? "var(--danger)"
                : "var(--text-primary)"
              : "var(--text-muted)",
          }}
        >
          <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
            <Calendar className="w-3.5 h-3.5 shrink-0 opacity-75" />
            <span className={value ? "font-mono tabular-nums truncate" : "truncate"}>
              {value ? formatCompactDayHeading(value) : placeholder}
            </span>
          </span>
        </button>

        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setOpen(false);
            }}
            title="Clear due date"
            aria-label="Clear due date"
            className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-hover)] shrink-0 cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Choose due date"
            className={`absolute z-50 w-[280px] sm:w-[296px] p-3 rounded-xl border ${
              align === "right" ? "right-0" : "left-0"
            } ${openUpwards ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <KansoCalendarPanel
              value={value}
              onSelectDate={(nextKey) => {
                onChange(nextKey ?? "");
                setOpen(false);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
};
