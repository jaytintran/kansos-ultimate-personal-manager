import React, { useMemo } from "react";
import { CalendarHeart, Gift, Sparkles } from "lucide-react";
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

  return (
    <section
      className="rounded-2xl border px-2.5 py-2 sm:px-3.5 sm:py-2.5 flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
      aria-label="Upcoming birthdays and anniversaries"
    >
      <div
        className="hidden sm:flex items-center gap-1.5 shrink-0 pr-2 border-r"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <Gift className="w-4 h-4" style={{ color: "var(--accent)" }} />
        <span
          className="text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"
          style={{ color: "var(--text-secondary)" }}
        >
          Upcoming Milestones
        </span>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        {upcoming.slice(0, 10).map((item) => {
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
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-colors shrink-0 hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{
                backgroundColor: isSelected
                  ? "var(--accent-soft)"
                  : isToday
                    ? "var(--bg-surface-subtle)"
                    : "var(--bg-elevated)",
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
                    <Sparkles className="w-3 h-3 shrink-0" style={{ color: "var(--accent)" }} />
                  ) : (
                    <CalendarHeart className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} />
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
    </section>
  );
};
