import type {
  FinanceAccount,
  FinanceBillingCycle,
  FinanceCategory,
  FinanceCurrency,
  FinanceTransaction,
  FinanceTransactionType,
} from "../types/finance";
import {
  addDaysToKey,
  getTodayKey,
  pad2,
  parseLocalDateKey,
  toLocalDateKey,
} from "../utils/date";

export const FINANCE_CURRENCIES: FinanceCurrency[] = ["VND", "EUR", "USD"];

export const FINANCE_CURRENCY_META: Record<
  FinanceCurrency,
  { code: FinanceCurrency; symbol: string; name: string; decimals: number }
> = {
  VND: { code: "VND", symbol: "₫", name: "Vietnamese Dong", decimals: 0 },
  EUR: { code: "EUR", symbol: "€", name: "Euro", decimals: 2 },
  USD: { code: "USD", symbol: "$", name: "US Dollar", decimals: 2 },
};

export function formatFinanceAmount(
  amount: number,
  currency: FinanceCurrency,
  opts?: { signed?: boolean; compact?: boolean; hideSymbol?: boolean },
): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : opts?.signed && amount > 0 ? "+" : "";
  const meta = FINANCE_CURRENCY_META[currency];

  if (opts?.compact) {
    let valStr = "";
    if (currency === "VND") {
      if (abs >= 1_000_000_000) {
        valStr = `${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
      } else if (abs >= 1_000_000) {
        valStr = `${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
      } else if (abs >= 1_000) {
        valStr = `${Math.round(abs / 1_000)}k`;
      } else {
        valStr = String(Math.round(abs));
      }
      return opts.hideSymbol ? `${sign}${valStr}` : `${sign}${valStr} ₫`;
    } else {
      if (abs >= 1_000_000) {
        valStr = `${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
      } else if (abs >= 1_000) {
        valStr = `${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
      } else {
        valStr = abs.toFixed(abs % 1 === 0 ? 0 : 2);
      }
      return opts.hideSymbol ? `${sign}${valStr}` : `${sign}${meta.symbol}${valStr}`;
    }
  }

  const formattedNum = abs.toLocaleString("en-US", {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });

  if (opts?.hideSymbol) return `${sign}${formattedNum}`;
  if (currency === "VND") return `${sign}${formattedNum} ₫`;
  return `${sign}${meta.symbol}${formattedNum}`;
}

export function computeAccountBalance(
  account: FinanceAccount,
  transactions: FinanceTransaction[],
): number {
  let bal = account.initialBalance || 0;
  for (const tx of transactions) {
    if (tx.type === "income" && tx.accountId === account.id) {
      bal += tx.amount;
    } else if (tx.type === "expense" && tx.accountId === account.id) {
      bal -= tx.amount;
    } else if (tx.type === "transfer") {
      if (tx.accountId === account.id) {
        bal -= tx.amount;
      }
      if (tx.toAccountId === account.id) {
        bal += tx.toAmount ?? tx.amount;
      }
    }
  }
  return bal;
}

export type FinancePeriodMode = "day" | "week" | "month" | "year" | "all";

export interface PeriodBounds {
  startKey: string | null;
  endKey: string | null;
  label: string;
}

export function getPeriodBounds(
  mode: FinancePeriodMode,
  anchorDateKey: string,
): PeriodBounds {
  const anchor = parseLocalDateKey(anchorDateKey);
  if (mode === "all") {
    return { startKey: null, endKey: null, label: "All Time" };
  }
  if (mode === "day") {
    const today = getTodayKey();
    const label =
      anchorDateKey === today
        ? "Today"
        : anchor.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
    return { startKey: anchorDateKey, endKey: anchorDateKey, label };
  }
  if (mode === "week") {
    // Monday-first week
    const dow = anchor.getDay();
    const offsetToMon = dow === 0 ? -6 : 1 - dow;
    const startKey = addDaysToKey(anchorDateKey, offsetToMon);
    const endKey = addDaysToKey(startKey, 6);
    const s = parseLocalDateKey(startKey);
    const e = parseLocalDateKey(endKey);
    const label = `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    return { startKey, endKey, label };
  }
  if (mode === "month") {
    const yr = anchor.getFullYear();
    const mo = anchor.getMonth();
    const lastDay = new Date(yr, mo + 1, 0).getDate();
    const startKey = `${yr}-${pad2(mo + 1)}-01`;
    const endKey = `${yr}-${pad2(mo + 1)}-${pad2(lastDay)}`;
    const label = anchor.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    return { startKey, endKey, label };
  }
  // year
  const yr = anchor.getFullYear();
  return {
    startKey: `${yr}-01-01`,
    endKey: `${yr}-12-31`,
    label: String(yr),
  };
}

export function shiftPeriodAnchor(
  mode: FinancePeriodMode,
  anchorDateKey: string,
  delta: number,
): string {
  if (mode === "day") return addDaysToKey(anchorDateKey, delta);
  if (mode === "week") return addDaysToKey(anchorDateKey, delta * 7);
  const d = parseLocalDateKey(anchorDateKey);
  if (mode === "month") {
    d.setMonth(d.getMonth() + delta);
    return toLocalDateKey(d);
  }
  if (mode === "year") {
    d.setFullYear(d.getFullYear() + delta);
    return toLocalDateKey(d);
  }
  return anchorDateKey;
}

export interface ParsedFinanceQuickInput {
  type: FinanceTransactionType;
  amount: number | null;
  currency: FinanceCurrency;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  dateKey: string;
  merchant: string;
  tags: string[];
}

/**
 * Parses natural finance entry strings such as:
 *   "-45k coffee @cash #food"
 *   "+2500 usd salary @bank #salary"
 *   "transfer 500k vnd @bank to @cash"
 */
export function parseFinanceQuickInput(
  rawInput: string,
  accounts: FinanceAccount[],
  categories: FinanceCategory[],
  defaultCurrency: FinanceCurrency,
): ParsedFinanceQuickInput {
  let working = rawInput.trim();
  const today = getTodayKey();
  let dateKey = today;
  let type: FinanceTransactionType = "expense";
  let currency: FinanceCurrency = defaultCurrency;
  let amount: number | null = null;
  let accountId: string | null = null;
  let toAccountId: string | null = null;
  let categoryId: string | null = null;
  const tags: string[] = [];

  if (!working) {
    const defaultAcc =
      accounts.find((a) => !a.archived && a.currency === defaultCurrency) ??
      accounts.find((a) => !a.archived) ??
      null;
    return {
      type,
      amount: null,
      currency,
      accountId: defaultAcc?.id ?? null,
      toAccountId: null,
      categoryId: null,
      dateKey,
      merchant: "",
      tags: [],
    };
  }

  // Detect explicit transfer syntax: "transfer ..." or "@a -> @b" or "@a to @b"
  if (
    /^transfer\b/i.test(working) ||
    /@\S+\s*(?:->|to)\s*@\S+/i.test(working)
  ) {
    type = "transfer";
    working = working.replace(/^transfer\b/i, "").trim();
  }

  // Detect date keywords
  if (/\byesterday\b/i.test(working)) {
    dateKey = addDaysToKey(today, -1);
    working = working.replace(/\byesterday\b/gi, "").trim();
  } else if (/\btoday\b/i.test(working)) {
    dateKey = today;
    working = working.replace(/\btoday\b/gi, "").trim();
  } else {
    const isoMatch = working.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (isoMatch) {
      dateKey = isoMatch[1];
      working = working.replace(isoMatch[0], "").trim();
    }
  }

  // Extract transfer arrow "@from -> @to" or "@from to @to"
  const transferAccMatch = working.match(/@([^\s#]+)\s*(?:->|to)\s*@([^\s#]+)/i);
  if (transferAccMatch) {
    type = "transfer";
    const fromSlug = transferAccMatch[1].toLowerCase();
    const toSlug = transferAccMatch[2].toLowerCase();
    accountId =
      accounts.find((a) => a.name.toLowerCase().includes(fromSlug))?.id ?? null;
    toAccountId =
      accounts.find((a) => a.name.toLowerCase().includes(toSlug))?.id ?? null;
    working = working.replace(transferAccMatch[0], "").trim();
  } else {
    // Extract single @account token(s)
    const accMatches = Array.from(working.matchAll(/@([^\s#]+)/g));
    for (const m of accMatches) {
      const slug = m[1].toLowerCase();
      const matched = accounts.find(
        (a) =>
          a.name.toLowerCase().includes(slug) ||
          a.type.toLowerCase() === slug,
      );
      if (matched) {
        if (!accountId) accountId = matched.id;
        else if (type === "transfer" && !toAccountId) toAccountId = matched.id;
      }
      working = working.replace(m[0], "").trim();
    }
  }

  // Extract #category or #tag tokens
  const hashMatches = Array.from(working.matchAll(/#([^\s@]+)/g));
  for (const m of hashMatches) {
    const slug = m[1].toLowerCase();
    const matchedCat = categories.find((c) =>
      c.name.toLowerCase().replace(/[^a-z0-9]/g, "").includes(slug.replace(/[^a-z0-9]/g, "")),
    );
    if (matchedCat && !categoryId) {
      categoryId = matchedCat.id;
      if (type !== "transfer") {
        type = matchedCat.kind;
      }
    } else {
      tags.push(slug);
    }
    working = working.replace(m[0], "").trim();
  }

  // Detect standalone currency token
  if (/\b(?:vnd|đ|vnđ)\b/i.test(working) || /₫/.test(working)) {
    currency = "VND";
    working = working.replace(/\b(?:vnd|vnđ)\b/gi, "").replace(/₫/g, "").trim();
  } else if (/\beur\b/i.test(working) || /€/.test(working)) {
    currency = "EUR";
    working = working.replace(/\beur\b/gi, "").replace(/€/g, "").trim();
  } else if (/\busd\b/i.test(working) || /\$/.test(working)) {
    currency = "USD";
    working = working.replace(/\busd\b/gi, "").replace(/\$/g, "").trim();
  }

  // Extract amount token (supports +45k, -1.2m, 150,000, 18.50, 45kđ)
  const amountRegex = /(?:^|\s)([+-])?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([kmb])?(đ|d)?(?=\s|$)/i;
  const amtMatch = working.match(amountRegex);
  if (amtMatch) {
    const sign = amtMatch[1];
    const numRaw = amtMatch[2].replace(/,/g, "");
    const suffix = (amtMatch[3] || "").toLowerCase();
    const dSuffix = amtMatch[4];
    let val = Number.parseFloat(numRaw);
    if (!Number.isNaN(val) && val > 0) {
      if (suffix === "k") val *= 1_000;
      else if (suffix === "m") val *= 1_000_000;
      else if (suffix === "b") val *= 1_000_000_000;
      amount = val;
      if (dSuffix) currency = "VND";
      if (type !== "transfer") {
        if (sign === "+") type = "income";
        else if (sign === "-") type = "expense";
      }
      working = working.replace(amtMatch[0], " ").trim();
    }
  }

  // Clean up residual "to" in transfer strings like "500k to"
  if (type === "transfer") {
    working = working.replace(/\bto\b/gi, " ").trim();
  }

  // Auto-detect income keywords if no explicit +/- and not transfer
  if (
    type === "expense" &&
    !rawInput.trim().startsWith("-") &&
    /\b(salary|payroll|freelance|dividend|refund|bonus|payout|income|received)\b/i.test(
      working,
    )
  ) {
    type = "income";
  }

  // Fallback currency from chosen account if user picked an account explicitly and didn't type currency
  if (
    accountId &&
    !/\b(?:vnd|eur|usd|đ|vnđ)\b|[₫€$]/i.test(rawInput)
  ) {
    const matchedAcc = accounts.find((a) => a.id === accountId);
    if (matchedAcc) currency = matchedAcc.currency;
  }

  // Fallback account matching the effective currency
  if (!accountId) {
    const fallbackAcc =
      accounts.find((a) => !a.archived && a.currency === currency) ??
      accounts.find((a) => !a.archived) ??
      null;
    accountId = fallbackAcc?.id ?? null;
  }

  // Smart category inference from merchant keywords if none explicitly chosen
  const merchant = working.replace(/\s+/g, " ").trim();
  if (!categoryId && type !== "transfer" && merchant) {
    const lower = merchant.toLowerCase();
    const matchingKindCats = categories.filter((c) => c.kind === type);
    const directMatch = matchingKindCats.find((c) =>
      lower.includes(c.name.toLowerCase()),
    );
    if (directMatch) {
      categoryId = directMatch.id;
    } else if (type === "expense") {
      if (/\b(coffee|cafe|lunch|dinner|breakfast|food|ramen|pho|banh mi|restaurant|grabfood)\b/.test(lower)) {
        categoryId = matchingKindCats.find((c) => /food|dining|coffee/i.test(c.name))?.id ?? null;
      } else if (/\b(grocery|supermarket|mart|milk|fruit|vegetables)\b/.test(lower)) {
        categoryId = matchingKindCats.find((c) => /grocer/i.test(c.name))?.id ?? null;
      } else if (/\b(uber|grab|taxi|metro|train|bus|fuel|gas|flight|parking)\b/.test(lower)) {
        categoryId = matchingKindCats.find((c) => /transport|travel|commute/i.test(c.name))?.id ?? null;
      } else if (/\b(netflix|spotify|icloud|chatgpt|subscription|github|adobe)\b/.test(lower)) {
        categoryId = matchingKindCats.find((c) => /sub|software|cloud/i.test(c.name))?.id ?? null;
      } else if (/\b(rent|electric|water|internet|wifi|utility|utilities)\b/.test(lower)) {
        categoryId = matchingKindCats.find((c) => /hous|rent|util/i.test(c.name))?.id ?? null;
      }
    }
  }

  return {
    type,
    amount,
    currency,
    accountId,
    toAccountId,
    categoryId,
    dateKey,
    merchant,
    tags,
  };
}

export function advanceSubscriptionDueDate(
  dateKey: string,
  cycle: FinanceBillingCycle,
): string {
  const d = parseLocalDateKey(dateKey);
  if (cycle === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (cycle === "monthly") {
    const origDay = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(origDay, maxDay));
  } else if (cycle === "quarterly") {
    const origDay = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 3);
    const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(origDay, maxDay));
  } else if (cycle === "yearly") {
    d.setFullYear(d.getFullYear() + 1);
  }
  return toLocalDateKey(d);
}

export function getMonthlyNormalizedAmount(
  amount: number,
  cycle: FinanceBillingCycle,
): number {
  switch (cycle) {
    case "weekly":
      return (amount * 52) / 12;
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "yearly":
      return amount / 12;
  }
}

export function daysUntilDateKey(
  dateKey: string,
  todayKey = getTodayKey(),
): number {
  const target = parseLocalDateKey(dateKey);
  const today = parseLocalDateKey(todayKey);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

// ============================================================================
// Bank Statement CSV Parser & Exporter
// ============================================================================

export function parseFinanceCsvTable(text: string): {
  headers: string[];
  rows: string[][];
} {
  const cleaned = text.replace(/^\uFEFF/, "");
  const firstLine = cleaned.split(/\r?\n/)[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const delimiter =
    tabCount > commaCount && tabCount > semiCount
      ? "\t"
      : semiCount > commaCount
        ? ";"
        : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((cell) => cell !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  return {
    headers: nonEmpty[0],
    rows: nonEmpty.slice(1),
  };
}

export function normalizeCsvDateKey(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${pad2(Number(iso[2]))}-${pad2(Number(iso[3]))}`;
  }
  const dmyOrMdy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmyOrMdy) {
    const a = Number(dmyOrMdy[1]);
    const b = Number(dmyOrMdy[2]);
    let yr = Number(dmyOrMdy[3]);
    if (yr < 100) yr += 2000;
    // Heuristic: if a > 12 it must be DD/MM, otherwise default MM/DD unless b > 12
    const month = a > 12 ? b : b > 12 ? a : a;
    const day = a > 12 ? a : b > 12 ? b : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yr}-${pad2(month)}-${pad2(day)}`;
    }
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return toLocalDateKey(parsed);
  }
  return null;
}

export function parseCsvNumericAmount(raw: string): number | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (!cleaned) return null;
  let negative = false;
  if (/^\(.*\)$/.test(cleaned)) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }
  if (cleaned.startsWith("-")) {
    negative = true;
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }
  cleaned = cleaned.replace(/[₫€$\sA-Za-z]/g, "");
  // Handle European 1.234,56 vs US 1,234.56
  if (/,\d{1,2}$/.test(cleaned) && cleaned.includes(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/,\d{1,2}$/.test(cleaned) && !cleaned.includes(".")) {
    cleaned = cleaned.replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const num = Number.parseFloat(cleaned);
  if (Number.isNaN(num)) return null;
  return negative ? -Math.abs(num) : num;
}

function escapeCsvCell(val: string): string {
  if (/[",\n\r]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function exportTransactionsToCsv(
  transactions: FinanceTransaction[],
  accounts: FinanceAccount[],
  categories: FinanceCategory[],
): string {
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const headers = [
    "Date",
    "Time",
    "Type",
    "Amount",
    "Currency",
    "Account",
    "To Account",
    "Category",
    "Merchant",
    "Note",
    "Tags",
  ];
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const tx of transactions) {
    const row = [
      tx.dateKey,
      tx.timeHHMM || "",
      tx.type,
      String(tx.amount),
      tx.currency,
      accMap.get(tx.accountId) || "",
      tx.toAccountId ? accMap.get(tx.toAccountId) || "" : "",
      tx.categoryId ? catMap.get(tx.categoryId) || "" : "",
      tx.merchant || "",
      tx.note || "",
      (tx.tags || []).join("; "),
    ];
    lines.push(row.map(escapeCsvCell).join(","));
  }
  return lines.join("\n");
}
