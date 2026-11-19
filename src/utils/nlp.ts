import { formatShortDate, formatTime, parseLocalDateKey, toLocalDateKey } from './date';

export interface NlpParseResult {
  raw: string;
  cleanTitle: string;
  scheduledAt: string | null;
  endAt: string | null;
  hasExplicitDate: boolean;
  hasExplicitTime: boolean;
  resolvedDateKey: string | null;
  matchedPhrases: string[];
  previewLabel: string | null;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const MONTH_PATTERN =
  'january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec';

function parseClockToken(
  hourStr: string,
  minuteStr: string | undefined,
  meridiem: string | undefined
): { hours: number; minutes: number } | null {
  let hours = parseInt(hourStr, 10);
  const minutes = minuteStr ? parseInt(minuteStr, 10) : 0;
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }
  if (meridiem) {
    const m = meridiem.toLowerCase();
    if (hours < 1 || hours > 12) return null;
    if (m === 'pm' && hours !== 12) hours += 12;
    if (m === 'am' && hours === 12) hours = 0;
  } else {
    if (hours < 0 || hours > 23) return null;
  }
  return { hours, minutes };
}

/**
 * Validates calendar day/month (and optional year) and rolls past yearless dates forward to next year.
 */
function resolveCalendarDate(
  day: number,
  monthIndex: number,
  explicitYear: number | undefined,
  todayMidnight: Date
): Date | null {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;

  let year = explicitYear ?? todayMidnight.getFullYear();
  if (year < 100) year += 2000;

  const candidate = new Date(year, monthIndex, day, 0, 0, 0, 0);
  // Reject invalid calendar overflow (e.g. 31 Feb -> March 3)
  if (candidate.getMonth() !== monthIndex || candidate.getDate() !== day) {
    return null;
  }

  // If no explicit year was supplied and the date has already passed this year, roll to next year
  if (explicitYear === undefined && candidate.getTime() < todayMidnight.getTime()) {
    const nextYearCandidate = new Date(year + 1, monthIndex, day, 0, 0, 0, 0);
    if (nextYearCandidate.getMonth() === monthIndex && nextYearCandidate.getDate() === day) {
      return nextYearCandidate;
    }
  }

  return candidate;
}

function addMonthsClamped(base: Date, monthsToAdd: number): Date {
  const targetYear = base.getFullYear();
  const targetMonth = base.getMonth() + monthsToAdd;
  const maxDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(base.getDate(), maxDay);
  return new Date(targetYear, targetMonth, clampedDay, 0, 0, 0, 0);
}

/**
 * Offline natural-language date & timestamp extractor for all Kanso input bars & details editors.
 * Supports:
 * - DD/MM and DD/MM/YYYY numeric dates: "22/11", "on 22/11", "5/12/2026"
 * - Natural dates: "23 December", "23rd Dec", "Dec 23", "December 23rd 2026"
 * - Relative calendars: "next week" (same weekday +7d), "next month", "in 3 days", "in 2 weeks", "in 1 month"
 * - Day keywords & weekdays: "today", "tomorrow", "tmr", "yesterday", "next monday", "this friday", "on tue"
 * - Relative clocks: "in 30m", "in 2h", "in 45 mins"
 * - Clock slots & ranges: "at 5pm", "@ 9:15am", "14:30", "from 2pm to 3:30pm", "2pm-3:30pm", "for 45m", "for 1.5h"
 */
export function parseNlpInput(
  input: string,
  baseDateKey?: string,
  timeFormat: '12h' | '24h' = '12h'
): NlpParseResult {
  const raw = input;
  if (!input.trim()) {
    return {
      raw,
      cleanTitle: '',
      scheduledAt: null,
      endAt: null,
      hasExplicitDate: false,
      hasExplicitTime: false,
      resolvedDateKey: null,
      matchedPhrases: [],
      previewLabel: null,
    };
  }

  let working = input;
  const matchedPhrases: string[] = [];

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const baseDate = baseDateKey ? parseLocalDateKey(baseDateKey) : new Date(todayMidnight);
  let targetDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  let hasExplicitDay = false;
  let startClock: { hours: number; minutes: number } | null = null;
  let endClock: { hours: number; minutes: number } | null = null;
  let durationMinutes: number | null = null;

  // 1. Relative time offset: "in 30m", "in 2h", "in 45 mins", "in 1.5 hours"
  const relativeTimeRe =
    /\bin\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b/i;
  const relTimeMatch = working.match(relativeTimeRe);
  if (relTimeMatch) {
    const qty = parseFloat(relTimeMatch[1]);
    const unit = relTimeMatch[2].toLowerCase();
    const offsetMs = unit.startsWith('h') ? qty * 60 * 60 * 1000 : qty * 60 * 1000;
    const future = new Date(now.getTime() + offsetMs);
    targetDate = new Date(future.getFullYear(), future.getMonth(), future.getDate());
    startClock = { hours: future.getHours(), minutes: future.getMinutes() };
    hasExplicitDay = true;
    matchedPhrases.push(relTimeMatch[0]);
    working = working.replace(relTimeMatch[0], ' ');
  }

  // 2. Date expressions (run if relative time wasn't matched)
  if (!relTimeMatch) {
    // 2a. Relative multi-day/week/month offset: "in 3 days", "in 2 weeks", "in 1 month", "in 4d", "in 2w"
    const relDateRe = /\bin\s+(\d+)\s*(d|day|days|w|wk|wks|week|weeks|mo|mos|month|months)\b/i;
    const relDateMatch = working.match(relDateRe);
    if (relDateMatch) {
      const qty = parseInt(relDateMatch[1], 10);
      const unit = relDateMatch[2].toLowerCase();
      if (unit.startsWith('mo')) {
        targetDate = addMonthsClamped(todayMidnight, qty);
      } else if (unit.startsWith('w')) {
        const d = new Date(todayMidnight);
        d.setDate(d.getDate() + qty * 7);
        targetDate = d;
      } else {
        const d = new Date(todayMidnight);
        d.setDate(d.getDate() + qty);
        targetDate = d;
      }
      hasExplicitDay = true;
      matchedPhrases.push(relDateMatch[0]);
      working = working.replace(relDateMatch[0], ' ');
    }

    // 2b. "next week" (same weekday +7 days) or "next month" (same day +1 month)
    if (!hasExplicitDay) {
      const nextPeriodRe = /\bnext\s+(week|month)\b/i;
      const periodMatch = working.match(nextPeriodRe);
      if (periodMatch) {
        const unit = periodMatch[1].toLowerCase();
        if (unit === 'week') {
          const d = new Date(todayMidnight);
          d.setDate(d.getDate() + 7);
          targetDate = d;
        } else {
          targetDate = addMonthsClamped(todayMidnight, 1);
        }
        hasExplicitDay = true;
        matchedPhrases.push(periodMatch[0]);
        working = working.replace(periodMatch[0], ' ');
      }
    }

    // 2c. Explicit numeric DD/MM(/YYYY) date: "22/11", "on 22/11", "05/12/2026"
    if (!hasExplicitDay) {
      const ddmmyyyyRe = /\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i;
      const slashMatch = working.match(ddmmyyyyRe);
      if (slashMatch) {
        const day = parseInt(slashMatch[1], 10);
        const month = parseInt(slashMatch[2], 10) - 1;
        const explicitYear = slashMatch[3] ? parseInt(slashMatch[3], 10) : undefined;
        const resolved = resolveCalendarDate(day, month, explicitYear, todayMidnight);
        if (resolved) {
          targetDate = resolved;
          hasExplicitDay = true;
          matchedPhrases.push(slashMatch[0]);
          working = working.replace(slashMatch[0], ' ');
        }
      }
    }

    // 2d. Natural Day + Month: "23 December", "23rd Dec", "on 23 December 2026"
    if (!hasExplicitDay) {
      const dayMonthRe = new RegExp(
        `\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_PATTERN})(?:[\\s,]+(\\d{4}))?\\b`,
        'i'
      );
      const dmMatch = working.match(dayMonthRe);
      if (dmMatch) {
        const day = parseInt(dmMatch[1], 10);
        const monthIndex = MONTHS[dmMatch[2].toLowerCase()];
        const explicitYear = dmMatch[3] ? parseInt(dmMatch[3], 10) : undefined;
        const resolved = resolveCalendarDate(day, monthIndex, explicitYear, todayMidnight);
        if (resolved) {
          targetDate = resolved;
          hasExplicitDay = true;
          matchedPhrases.push(dmMatch[0]);
          working = working.replace(dmMatch[0], ' ');
        }
      }
    }

    // 2e. Natural Month + Day: "December 23", "Dec 23rd", "on Dec 23, 2026"
    if (!hasExplicitDay) {
      const monthDayRe = new RegExp(
        `\\b(?:on\\s+)?(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[\\s,]+(\\d{4}))?\\b`,
        'i'
      );
      const mdMatch = working.match(monthDayRe);
      if (mdMatch) {
        const monthIndex = MONTHS[mdMatch[1].toLowerCase()];
        const day = parseInt(mdMatch[2], 10);
        const explicitYear = mdMatch[3] ? parseInt(mdMatch[3], 10) : undefined;
        const resolved = resolveCalendarDate(day, monthIndex, explicitYear, todayMidnight);
        if (resolved) {
          targetDate = resolved;
          hasExplicitDay = true;
          matchedPhrases.push(mdMatch[0]);
          working = working.replace(mdMatch[0], ' ');
        }
      }
    }

    // 2f. Day keywords: "tomorrow", "tmr", "yesterday", "today"
    if (!hasExplicitDay) {
      const dayKeywordRe = /\b(tomorrow|tmr|yesterday|today)\b/i;
      const dayMatch = working.match(dayKeywordRe);
      if (dayMatch) {
        const token = dayMatch[1].toLowerCase();
        const d = new Date(todayMidnight);
        if (token === 'tomorrow' || token === 'tmr') d.setDate(d.getDate() + 1);
        if (token === 'yesterday') d.setDate(d.getDate() - 1);
        targetDate = d;
        hasExplicitDay = true;
        matchedPhrases.push(dayMatch[0]);
        working = working.replace(dayMatch[0], ' ');
      }
    }

    // 2g. Weekday keywords: "next monday", "this friday", "on thu"
    if (!hasExplicitDay) {
      const weekdayRe =
        /\b(next|this|on)\s+(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/i;
      const wdMatch = working.match(weekdayRe);
      if (wdMatch) {
        const prefix = wdMatch[1].toLowerCase();
        const wanted = WEEKDAYS[wdMatch[2].toLowerCase()];
        const d = new Date(todayMidnight);
        let diff = (wanted - d.getDay() + 7) % 7;
        if (prefix === 'next') {
          diff = diff === 0 ? 7 : diff;
        } else if (prefix === 'on' && diff === 0) {
          diff = 7;
        }
        d.setDate(d.getDate() + diff);
        targetDate = d;
        hasExplicitDay = true;
        matchedPhrases.push(wdMatch[0]);
        working = working.replace(wdMatch[0], ' ');
      }
    }
  }

  // 3. Time range: "from 2pm to 3:30pm" or "2pm-3:30pm" or "14:00 - 15:30"
  if (!startClock) {
    const rangeRe =
      /(?:\bfrom\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
    const rangeMatch = working.match(rangeRe);
    if (rangeMatch && (rangeMatch[3] || rangeMatch[6] || rangeMatch[2] || rangeMatch[5])) {
      const startMeridiem = rangeMatch[3] || rangeMatch[6];
      const endMeridiem = rangeMatch[6] || rangeMatch[3];
      const parsedStart = parseClockToken(rangeMatch[1], rangeMatch[2], startMeridiem);
      const parsedEnd = parseClockToken(rangeMatch[4], rangeMatch[5], endMeridiem);
      if (parsedStart && parsedEnd) {
        startClock = parsedStart;
        endClock = parsedEnd;
        matchedPhrases.push(rangeMatch[0]);
        working = working.replace(rangeMatch[0], ' ');
      }
    }
  }

  // 4. Explicit "at <time>" or "@ <time>" (e.g. "at 5pm", "at 4:30pm", "at 14:00", "@ 9am")
  if (!startClock) {
    const atTimeRe = /(?:\bat\s+|@\s*)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
    const atMatch = working.match(atTimeRe);
    if (atMatch && (atMatch[3] || atMatch[2])) {
      const parsed = parseClockToken(atMatch[1], atMatch[2], atMatch[3]);
      if (parsed) {
        startClock = parsed;
        matchedPhrases.push(atMatch[0]);
        working = working.replace(atMatch[0], ' ');
      }
    }
  }

  // 5. Standalone clock with explicit am/pm or 24h HH:MM (e.g., "Coffee 4:30pm", "Sync 14:30")
  if (!startClock) {
    const bareMeridiemRe = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
    const bareMatch = working.match(bareMeridiemRe);
    if (bareMatch) {
      const parsed = parseClockToken(bareMatch[1], bareMatch[2], bareMatch[3]);
      if (parsed) {
        startClock = parsed;
        matchedPhrases.push(bareMatch[0]);
        working = working.replace(bareMatch[0], ' ');
      }
    } else {
      const bare24hRe = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
      const match24 = working.match(bare24hRe);
      if (match24) {
        const parsed = parseClockToken(match24[1], match24[2], undefined);
        if (parsed) {
          startClock = parsed;
          matchedPhrases.push(match24[0]);
          working = working.replace(match24[0], ' ');
        }
      }
    }
  }

  // 6. Optional duration suffix: "for 45m", "for 1.5h", "for 2 hours"
  const durationRe = /\bfor\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b/i;
  const durMatch = working.match(durationRe);
  if (durMatch) {
    const qty = parseFloat(durMatch[1]);
    const unit = durMatch[2].toLowerCase();
    durationMinutes = Math.round(unit.startsWith('h') ? qty * 60 : qty);
    matchedPhrases.push(durMatch[0]);
    working = working.replace(durMatch[0], ' ');
  }

  let scheduledAt: string | null = null;
  let endAt: string | null = null;
  const hasExplicitTime = Boolean(startClock);

  if (startClock) {
    const startDate = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      startClock.hours,
      startClock.minutes,
      0,
      0
    );
    scheduledAt = startDate.toISOString();

    if (endClock) {
      const endDate = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
        endClock.hours,
        endClock.minutes,
        0,
        0
      );
      if (endDate.getTime() <= startDate.getTime()) {
        endDate.setDate(endDate.getDate() + 1);
      }
      endAt = endDate.toISOString();
    } else if (durationMinutes) {
      endAt = new Date(startDate.getTime() + durationMinutes * 60 * 1000).toISOString();
    }
  } else if (hasExplicitDay) {
    // Explicit day like "22/11", "23 December", "next week" without clock -> 9:00 AM default
    const startDate = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      9,
      0,
      0,
      0
    );
    scheduledAt = startDate.toISOString();
    if (durationMinutes) {
      endAt = new Date(startDate.getTime() + durationMinutes * 60 * 1000).toISOString();
    }
  }

  const cleanTitle = working.replace(/\s{2,}/g, ' ').trim() || input.trim();
  const resolvedDateKey = scheduledAt ? toLocalDateKey(scheduledAt) : null;

  let previewLabel: string | null = null;
  if (scheduledAt) {
    const todayKey = toLocalDateKey(now);
    const schedKey = toLocalDateKey(scheduledAt);
    const dayStr = schedKey === todayKey ? 'Today' : formatShortDate(schedKey);
    const startStr = formatTime(scheduledAt, timeFormat);
    if (endAt) {
      previewLabel = `${dayStr} · ${startStr} – ${formatTime(endAt, timeFormat)}`;
    } else if (hasExplicitTime) {
      previewLabel = `${dayStr} · ${startStr}`;
    } else {
      previewLabel = `${dayStr} · ${startStr}`;
    }
  }

  return {
    raw,
    cleanTitle,
    scheduledAt,
    endAt,
    hasExplicitDate: hasExplicitDay,
    hasExplicitTime,
    resolvedDateKey,
    matchedPhrases,
    previewLabel,
  };
}
