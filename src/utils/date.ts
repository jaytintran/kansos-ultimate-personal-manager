import { Entry, Habit } from "../types";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toLocalDateKey(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseLocalDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function addDaysToKey(dateKey: string, delta: number): string {
  const d = parseLocalDateKey(dateKey);
  d.setDate(d.getDate() + delta);
  return toLocalDateKey(d);
}

export function getTodayKey(): string {
  return toLocalDateKey(new Date());
}

/**
 * Spine denominator: completedAt > scheduledAt > createdAt
 */
export function getEffectiveSortIso(
  entry: Pick<Entry, "completedAt" | "scheduledAt" | "createdAt">,
): string {
  return entry.completedAt || entry.scheduledAt || entry.createdAt;
}

export function getEffectiveSortMs(
  entry: Pick<Entry, "completedAt" | "scheduledAt" | "createdAt">,
): number {
  return new Date(getEffectiveSortIso(entry)).getTime();
}

export const getEntrySortTime = getEffectiveSortMs;

export function getEntryDayKey(
  entry: Pick<Entry, "completedAt" | "scheduledAt" | "createdAt">,
): string {
  return toLocalDateKey(getEffectiveSortIso(entry));
}

export function isEntryActive(entry: Entry): boolean {
  return !entry.archived && entry.noteStatus !== "archived";
}

/**
 * Timeline visibility rules:
 * - Soft-deleted, trashed, or archived entries are hidden.
 * - Focus Anchors never appear in Timeline (unless cleared from Focus View, which flips source -> 'timeline').
 * - Focus Active & Custom Tab tasks stay hidden from Timeline while active; they appear once completed.
 * - Standalone notes with syncToTimeline === false stay in Notes view only.
 */
export function isVisibleOnTimeline(entry: Entry): boolean {
  if (!isEntryActive(entry)) {
    return false;
  }
  if (entry.type === "note" && entry.syncToTimeline === false) {
    return false;
  }
  const source = entry.source;
  if (
    source === "focus-anchor" ||
    (source === undefined && entry.focusBucket === "anchor")
  ) {
    return false;
  }
  if (
    (source === "focus-active" ||
      (source === undefined && entry.focusBucket === "x-active")) &&
    !entry.completed
  ) {
    return false;
  }
  if (source === "custom-tab" && !entry.completed) {
    return false;
  }
  return true;
}

export function getCleanTitle(entry: Pick<Entry, "title" | "source">): string {
  if (entry.source === "habit" && /^Completed habit:\s*/i.test(entry.title)) {
    return (
      entry.title.replace(/^Completed habit:\s*/i, "").trim() || entry.title
    );
  }
  return entry.title;
}

export function stripHtmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWordsFromHtml(html: string): number {
  const text = stripHtmlToText(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function formatTime(
  iso: string | null | undefined,
  format: "12h" | "24h" = "12h",
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (format === "24h") {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const suffix = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${pad2(minutes)} ${suffix}`;
}

export function formatShortDate(isoOrKey: string): string {
  const d =
    isoOrKey.length === 10 ? parseLocalDateKey(isoOrKey) : new Date(isoOrKey);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDaySlashMonth(dateKey: string): string {
  const d = parseLocalDateKey(dateKey);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * Formats day strip labels matching:
 * - Today, 15/11
 * - Yesterday
 * - Wed, 12/11 (same year)
 * - Wed, 12/11/2024 (different year)
 */
export function formatCompactDayHeading(dateKey: string): string {
  const today = getTodayKey();
  const d = parseLocalDateKey(dateKey);
  const ddmm = `${d.getDate()}/${d.getMonth() + 1}`;
  if (dateKey === today) return `Today, ${ddmm}`;
  if (dateKey === addDaysToKey(today, -1)) return "Yesterday";
  if (dateKey === addDaysToKey(today, 1)) return `Tomorrow, ${ddmm}`;
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const nowYear = new Date().getFullYear();
  if (d.getFullYear() !== nowYear) {
    return `${weekday}, ${ddmm}/${d.getFullYear()}`;
  }
  return `${weekday}, ${ddmm}`;
}

export function formatLongDate(dateKey: string): string {
  const d = parseLocalDateKey(dateKey);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelativeDayLabel(dateKey: string): string {
  const today = getTodayKey();
  if (dateKey === today) return "Today";
  if (dateKey === addDaysToKey(today, -1)) return "Yesterday";
  if (dateKey === addDaysToKey(today, 1)) return "Tomorrow";
  const d = parseLocalDateKey(dateKey);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function buildDateAtTime(
  dateKey: string,
  hours: number,
  minutes: number,
): string {
  const d = parseLocalDateKey(dateKey);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export function toTimeInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function combineLocalDateAndTime(
  dateKey: string,
  timeHHMM: string,
): string | null {
  if (!dateKey || !timeHHMM) return null;
  const parts = timeHHMM.split(":").map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1]))
    return null;
  const [hours, minutes] = parts;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return buildDateAtTime(dateKey, hours, minutes);
}

export function replaceIsoDateKeepingTime(
  iso: string,
  nextDateKey: string,
): string {
  const prev = new Date(iso);
  const next = parseLocalDateKey(nextDateKey);
  if (!Number.isNaN(prev.getTime())) {
    next.setHours(prev.getHours(), prev.getMinutes(), prev.getSeconds(), 0);
  } else {
    next.setHours(9, 0, 0, 0);
  }
  return next.toISOString();
}

export function replaceIsoTimeKeepingDate(
  iso: string,
  timeHHMM: string,
): string | null {
  const dateKey = toLocalDateKey(iso);
  return combineLocalDateAndTime(dateKey, timeHHMM);
}

export function addMinutesToIso(iso: string, deltaMinutes: number): string {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return new Date().toISOString();
  return new Date(base.getTime() + deltaMinutes * 60 * 1000).toISOString();
}

export function getRangeDateKeys(endDateKey: string, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(addDaysToKey(endDateKey, -i));
  }
  return keys;
}

export function getMonthDateKeys(year: number, monthIndex: number): string[] {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const keys: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    keys.push(`${year}-${pad2(monthIndex + 1)}-${pad2(day)}`);
  }
  return keys;
}

export function getCalendarMatrix(
  year: number,
  monthIndex: number,
): (string | null)[] {
  const firstDayOfWeek = new Date(year, monthIndex, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${year}-${pad2(monthIndex + 1)}-${pad2(day)}`);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function getDayShortName(dateKey: string): string {
  const d = parseLocalDateKey(dateKey);
  return d.toLocaleDateString(undefined, { weekday: "narrow" });
}

export function getDayAbbrev(dateKey: string): string {
  const d = parseLocalDateKey(dateKey);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export function getDayNumber(dateKey: string): number {
  return Number(dateKey.split("-")[2]);
}

export function getDayOfWeek(dateKey: string): number {
  return parseLocalDateKey(dateKey).getDay();
}

export function getRecentDateKeys(count: number): string[] {
  return getRangeDateKeys(getTodayKey(), count);
}

export function isHabitScheduledOnDay(
  habit: Pick<Habit, "frequencyType" | "customDays">,
  dateKey: string,
): boolean {
  const dow = getDayOfWeek(dateKey);
  if (habit.frequencyType === "daily") return true;
  if (habit.frequencyType === "weekdays") return dow >= 1 && dow <= 5;
  if (
    habit.frequencyType === "custom" &&
    Array.isArray(habit.customDays) &&
    habit.customDays.length > 0
  ) {
    return habit.customDays.includes(dow);
  }
  return true;
}
