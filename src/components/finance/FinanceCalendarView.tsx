import React, { useMemo } from "react";
import { formatFinanceAmount } from "../../lib/financeUtils";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceCurrency,
  FinanceTransaction,
} from "../../types/finance";
import { getCalendarMatrix, getTodayKey, parseLocalDateKey } from "../../utils/date";
import { FinanceIcon } from "./FinanceIcon";

interface FinanceCalendarViewProps {
  anchorDateKey: string;
  selectedDayKey: string;
  onSelectDayKey: (dayKey: string) => void;
  currency: FinanceCurrency;
  transactions: FinanceTransaction[]; // Filtered to active currency
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  onEditTransaction: (tx: FinanceTransaction) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const FinanceCalendarView: React.FC<FinanceCalendarViewProps> = ({
  anchorDateKey,
  selectedDayKey,
  onSelectDayKey,
  currency,
  transactions,
  accounts,
  categories,
  onEditTransaction,
}) => {
  const todayKey = getTodayKey();
  const anchorDate = parseLocalDateKey(anchorDateKey);
  const year = anchorDate.getFullYear();
  const monthIndex = anchorDate.getMonth();

  const matrix = useMemo(
    () => getCalendarMatrix(year, monthIndex),
    [year, monthIndex],
  );

  const dayTotals = useMemo(() => {
    const map = new Map<string, { income: number; expense: number; count: number }>();
    for (const tx of transactions) {
      if (tx.currency !== currency) continue;
      const cur = map.get(tx.dateKey) ?? { income: 0, expense: 0, count: 0 };
      if (tx.type === "income") cur.income += tx.amount;
      else if (tx.type === "expense") cur.expense += tx.amount;
      cur.count++;
      map.set(tx.dateKey, cur);
    }
    return map;
  }, [transactions, currency]);

  const selectedDayTransactions = useMemo(
    () =>
      transactions
        .filter((tx) => tx.dateKey === selectedDayKey && tx.currency === currency)
        .sort((a, b) => (b.timeHHMM || "").localeCompare(a.timeHHMM || "")),
    [transactions, selectedDayKey, currency],
  );

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      {/* Calendar Matrix */}
      <div
        className="xl:col-span-8 rounded-2xl border p-3 sm:p-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className="text-center text-[11px] font-semibold uppercase tracking-wider py-1"
              style={{ color: "var(--text-muted)" }}
            >
              {wd}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {matrix.map((dayKey, idx) => {
            if (!dayKey) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="min-h-[64px] sm:min-h-[78px] rounded-xl opacity-30"
                  style={{ backgroundColor: "var(--bg-surface-subtle)" }}
                />
              );
            }
            const stats = dayTotals.get(dayKey);
            const isSelected = dayKey === selectedDayKey;
            const isToday = dayKey === todayKey;
            const dayNum = Number(dayKey.slice(8, 10));

            return (
              <button
                key={dayKey}
                type="button"
                onClick={() => onSelectDayKey(dayKey)}
                className="min-h-[64px] sm:min-h-[78px] p-1.5 sm:p-2 rounded-xl border text-left flex flex-col justify-between transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{
                  backgroundColor: isSelected
                    ? "var(--accent-soft)"
                    : "var(--bg-elevated)",
                  borderColor: isSelected
                    ? "var(--accent)"
                    : isToday
                      ? "var(--border-strong)"
                      : "var(--border-subtle)",
                }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      isToday ? "font-bold" : "font-medium"
                    }`}
                    style={{
                      color: isToday
                        ? "var(--accent)"
                        : "var(--text-primary)",
                    }}
                  >
                    {dayNum}
                  </span>
                  {stats && stats.count > 0 && (
                    <span
                      className="text-[10px] font-mono tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {stats.count}
                    </span>
                  )}
                </div>

                {stats && (
                  <div className="space-y-0.5 text-[10px] font-mono tabular-nums leading-tight truncate">
                    {stats.income > 0 && (
                      <div className="truncate" style={{ color: "var(--success)" }}>
                        +{formatFinanceAmount(stats.income, currency, { compact: true, hideSymbol: true })}
                      </div>
                    )}
                    {stats.expense > 0 && (
                      <div className="truncate" style={{ color: "var(--danger)" }}>
                        -{formatFinanceAmount(stats.expense, currency, { compact: true, hideSymbol: true })}
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Ledger Detail */}
      <div
        className="xl:col-span-4 rounded-2xl border p-4 flex flex-col gap-3"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: "var(--border-subtle)" }}>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Selected Day
            </div>
            <div className="font-display font-bold text-sm mt-0.5">
              {parseLocalDateKey(selectedDayKey).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>
          <span className="text-xs font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
            {selectedDayTransactions.length} items
          </span>
        </div>

        {selectedDayTransactions.length === 0 ? (
          <div className="py-10 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            No {currency} transactions logged on this date.
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto max-h-[380px]">
            {selectedDayTransactions.map((tx) => {
              const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : null;
              const acc = accountMap.get(tx.accountId);
              const toAcc = tx.toAccountId ? accountMap.get(tx.toAccountId) : null;
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => onEditTransaction(tx)}
                  className="w-full p-2.5 rounded-xl border flex items-center justify-between gap-2.5 text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: "var(--bg-surface-subtle)",
                        color: cat?.color || "var(--accent)",
                      }}
                    >
                      <FinanceIcon name={cat?.icon || "Repeat"} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {tx.merchant || cat?.name || tx.type}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                        {acc?.name}
                        {tx.type === "transfer" && toAcc ? ` → ${toAcc.name}` : ""}
                        {cat ? ` · ${cat.name}` : ""}
                      </div>
                    </div>
                  </div>
                  <div
                    className="text-xs font-bold font-mono tabular-nums shrink-0"
                    style={{
                      color:
                        tx.type === "income"
                          ? "var(--success)"
                          : tx.type === "expense"
                            ? "var(--danger)"
                            : "var(--accent)",
                    }}
                  >
                    {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
                    {formatFinanceAmount(tx.amount, tx.currency)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
