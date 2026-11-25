import React, { useMemo } from "react";
import {
  CalendarHeart,
  ChevronDown,
  ChevronUp,
  Gift,
  Sparkles,
} from "lucide-react";
import {
  formatMonthDayLabel,
  getContactDisplayName,
  getNextOccurrenceInfo,
} from "../../lib/contactUtils";
import type { ContactRecord } from "../../types/contacts";
import { getTodayKey } from "../../utils/date";
import { ContactAvatar } from "./ContactAvatar";

interface ContactUpcomingStripProps {
  contacts: ContactRecord[];
  selectedId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectContact: (contactId: string) => void;
}

interface UpcomingMilestoneItem {
  key: string;
  contact: ContactRecord;
  kind: "birthday" | "anniversary";
  dateStr: string;
  daysUntil: number;
  turningAge: number | null;
}

export const ContactUpcomingStrip: React.FC<ContactUpcomingStripProps> = ({
  contacts,
  selectedId,
  collapsed,
  onToggleCollapsed,
  onSelectContact,
}) => {
  const todayKey = getTodayKey();

  const upcoming = useMemo(() => {
    const items: UpcomingMilestoneItem[] = [];
    for (const c of contacts) {
      if (c.birthday) {
        const info = getNextOccurrenceInfo(c.birthday, todayKey);
        if (info && info.daysUntil <= 45) {
          items.push({
            key: `b-${c.id}`,
            contact: c,
            kind: "birthday",
            dateStr: c.birthday,
            daysUntil: info.daysUntil,
            turningAge: info.turningAge,
          });
        }
      }
      if (c.anniversary) {
        const info = getNextOccurrenceInfo(c.anniversary, todayKey);
        if (info && info.daysUntil <= 45) {
          items.push({
            key: `a-${c.id}`,
            contact: c,
            kind: "anniversary",
            dateStr: c.anniversary,
            daysUntil: info.daysUntil,
            turningAge: info.turningAge,
          });
        }
      }
    }
    return items.sort((a, b) => a.daysUntil - b.daysUntil);
  }, [contacts, todayKey]);

  if (upcoming.length === 0) return null;

  const nearest = upcoming[0];
  const nearestCountdown =
    nearest.daysUntil === 0
      ? "Today"
      : nearest.daysUntil === 1
        ? "Tomorrow"
        : `in ${nearest.daysUntil}d`;

  return (
    <section
      className="rounded-xl border overflow-hidden transition-colors"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
      aria-label="Upcoming birthdays and anniversaries"
    >
      {/* Subtle Alert Header Row */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Gift
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: "var(--accent)" }}
          />
          <span
            className="text-xs font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {upcoming.length}{" "}
            {upcoming.length === 1 ? "upcoming milestone" : "upcoming milestones"}
          </span>
          <span
            className="text-xs truncate hidden sm:inline"
            style={{ color: "var(--text-muted)" }}
          >
            · Next: {getContactDisplayName(nearest.contact)} ({nearestCountdown})
          </span>
        </div>

        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="hidden sm:inline">
            {collapsed ? "Show" : "Hide"}
          </span>
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </span>
      </button>

      {/* Expandable Strip */}
      {!collapsed && (
        <div
          className="px-3 py-2 border-t flex items-center gap-2 overflow-x-auto no-scrollbar"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-surface-subtle)",
          }}
        >
          {upcoming.slice(0, 12).map((item) => {
            const isSelected = selectedId === item.contact.id;
            const isToday = item.daysUntil === 0;
            const countdownLabel =
              item.daysUntil === 0
                ? "Today"
                : item.daysUntil === 1
                  ? "Tomorrow"
                  : `in ${item.daysUntil}d`;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectContact(item.contact.id)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors shrink-0 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{
                  backgroundColor: isSelected
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                  borderColor: isSelected
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                }}
              >
                <ContactAvatar contact={item.contact} size="xs" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
                    <span className="truncate max-w-[130px]">
                      {getContactDisplayName(item.contact)}
                    </span>
                    {item.kind === "birthday" ? (
                      <Sparkles
                        className="w-3 h-3 shrink-0"
                        style={{ color: "var(--accent)" }}
                      />
                    ) : (
                      <CalendarHeart
                        className="w-3 h-3 shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      />
                    )}
                  </div>
                  <div
                    className="text-[11px] font-mono tabular-nums whitespace-nowrap"
                    style={{
                      color: isToday ? "var(--accent)" : "var(--text-muted)",
                    }}
                  >
                    {countdownLabel} · {formatMonthDayLabel(item.dateStr)}
                    {item.kind === "birthday" && item.turningAge !== null
                      ? ` (${item.turningAge})`
                      : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
