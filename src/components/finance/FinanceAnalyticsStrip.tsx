import React, { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Scale } from "lucide-react";
import {
  FinancePeriodMode,
  formatFinanceAmount,
} from "../../lib/financeUtils";
import type {
  FinanceCategory,
  FinanceCurrency,
  FinanceTransaction,
} from "../../types/finance";
import { parseLocalDateKey } from "../../utils/date";
import { FinanceIcon } from "./FinanceIcon";

interface FinanceAnalyticsStripProps {
  currency: FinanceCurrency;
  periodMode: FinancePeriodMode;
  transactions: FinanceTransaction[]; // Already filtered to active currency & period
  categories: FinanceCategory[];
  activeCategoryFilter: string;
  onSelectCategoryFilter: (catId: string) => void;
}

interface BucketPoint {
  key: string;
  label: string;
  income: number;
  expense: number;
}

export const FinanceAnalyticsStrip: React.FC<FinanceAnalyticsStripProps> = ({
  currency,
  periodMode,
  transactions,
  categories,
  activeCategoryFilter,
  onSelectCategoryFilter,
}) => {
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    let count = 0;
    for (const tx of transactions) {
      if (tx.type === "income") {
        income += tx.amount;
        count++;
      } else if (tx.type === "expense") {
        expense += tx.amount;
        count++;
      }
    }
    const net = income - expense;
    const savingsRate =
      income > 0 ? Math.round(((income - expense) / income) * 100) : null;
    return { income, expense, net, count, savingsRate };
  }, [transactions]);

  // Build comparison bars: by day (for week/month/day) or by month (for year/all)
  const buckets = useMemo<BucketPoint[]>(() => {
    const groupByMonth = periodMode === "year" || periodMode === "all";
    const map = new Map<string, BucketPoint>();

    for (const tx of transactions) {
      if (tx.type === "transfer") continue;
      const key = groupByMonth ? tx.dateKey.slice(0, 7) : tx.dateKey;
      let existing = map.get(key);
      if (!existing) {
        const label = groupByMonth
          ? parseLocalDateKey(`${key}-01`).toLocaleDateString(undefined, {
              month: "short",
            })
          : String(Number(tx.dateKey.slice(8, 10)));
        existing = { key, label, income: 0, expense: 0 };
        map.set(key, existing);
      }
      if (tx.type === "income") existing.income += tx.amount;
      else if (tx.type === "expense") existing.expense += tx.amount;
    }

    const sorted = Array.from(map.values()).sort((a, b) =>
      a.key.localeCompare(b.key),
    );
    return sorted.slice(-14);
  }, [transactions, periodMode]);

  const maxBucketVal = useMemo(() => {
    let m = 0;
    for (const b of buckets) {
      if (b.income > m) m = b.income;
      if (b.expense > m) m = b.expense;
    }
    return m || 1;
  }, [buckets]);

  // Expense category breakdown
  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    let totalExp = 0;
    for (const tx of transactions) {
      if (tx.type !== "expense") continue;
      const cid = tx.categoryId || "uncategorized";
      totals.set(cid, (totals.get(cid) || 0) + tx.amount);
      totalExp += tx.amount;
    }
    const rows = Array.from(totals.entries())
      .map(([id, amount]) => {
        const cat = categoryMap.get(id);
        return {
          id,
          name: cat?.name || "Uncategorized",
          icon: cat?.icon || "Tag",
          color: cat?.color || "#64748b",
          amount,
          pct: totalExp > 0 ? (amount / totalExp) * 100 : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
    return { rows, totalExp };
  }, [transactions, categoryMap]);

  // Build SVG Donut arcs
  const donutSegments = useMemo(() => {
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    return categoryBreakdown.rows.slice(0, 7).map((row) => {
      const length = (row.pct / 100) * circumference;
      const seg = {
        ...row,
        strokeDasharray: `${Math.max(length - 1.5, 0)} ${circumference}`,
        strokeDashoffset: -offset,
      };
      offset += length;
      return seg;
    });
  }, [categoryBreakdown.rows]);

  return (
    <div className="space-y-3">
      {/* Top 3 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          className="p-3.5 rounded-2xl border flex items-center justify-between gap-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Income ({currency})
            </div>
            <div
              className="text-lg sm:text-xl font-bold font-mono tabular-nums mt-0.5 truncate"
              style={{ color: "var(--success)" }}
            >
              {formatFinanceAmount(summary.income, currency, { signed: summary.income > 0 })}
            </div>
          </div>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "var(--bg-surface-subtle)", color: "var(--success)" }}
          >
            <ArrowDownRight className="w-4 h-4" />
          </div>
        </div>

        <div
          className="p-3.5 rounded-2xl border flex items-center justify-between gap-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Spent ({currency})
            </div>
            <div
              className="text-lg sm:text-xl font-bold font-mono tabular-nums mt-0.5 truncate"
              style={{ color: "var(--danger)" }}
            >
              {formatFinanceAmount(summary.expense, currency)}
            </div>
          </div>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "var(--bg-surface-subtle)", color: "var(--danger)" }}
          >
            <ArrowUpRight className="w-4 h-4" />
          </div>
        </div>

        <div
          className="p-3.5 rounded-2xl border flex items-center justify-between gap-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Net Cashflow
              </span>
              {summary.savingsRate !== null && (
                <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                  · {summary.savingsRate}% saved
                </span>
              )}
            </div>
            <div
              className="text-lg sm:text-xl font-bold font-mono tabular-nums mt-0.5 truncate"
              style={{
                color:
                  summary.net >= 0 ? "var(--text-primary)" : "var(--danger)",
              }}
            >
              {formatFinanceAmount(summary.net, currency, { signed: true })}
            </div>
          </div>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Scale className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Charts Row: Income vs Expense + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Income vs Expense Grouped Bars */}
        <div
          className="lg:col-span-6 p-4 rounded-2xl border flex flex-col justify-between gap-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Income vs. Expense
              </h3>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {periodMode === "year" || periodMode === "all"
                  ? "Monthly cashflow comparison"
                  : "Daily cashflow activity"}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "var(--success)" }} />
                In
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "var(--danger)" }} />
                Out
              </span>
            </div>
          </div>

          {buckets.length === 0 ? (
            <div className="h-28 flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>
              No {currency} cashflow activity in this period.
            </div>
          ) : (
            <div className="h-32 flex items-end gap-2 pt-2">
              {buckets.map((b) => {
                const incH = Math.max(
                  b.income > 0 ? 6 : 0,
                  Math.round((b.income / maxBucketVal) * 96),
                );
                const expH = Math.max(
                  b.expense > 0 ? 6 : 0,
                  Math.round((b.expense / maxBucketVal) * 96),
                );
                return (
                  <div
                    key={b.key}
                    className="flex-1 min-w-0 flex flex-col items-center gap-1.5 group"
                    title={`${b.key}: In ${formatFinanceAmount(b.income, currency)} · Out ${formatFinanceAmount(b.expense, currency)}`}
                  >
                    <div className="w-full h-24 flex items-end justify-center gap-1">
                      <div
                        className="w-2 sm:w-2.5 rounded-t transition-all"
                        style={{
                          height: `${incH}%`,
                          backgroundColor: "var(--success)",
                          opacity: b.income > 0 ? 0.9 : 0.12,
                        }}
                      />
                      <div
                        className="w-2 sm:w-2.5 rounded-t transition-all"
                        style={{
                          height: `${expH}%`,
                          backgroundColor: "var(--danger)",
                          opacity: b.expense > 0 ? 0.9 : 0.12,
                        }}
                      />
                    </div>
                    <span
                      className="text-[10px] font-mono tabular-nums truncate max-w-full"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {b.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category Breakdown Donut + Interactive Filter Bars */}
        <div
          className="lg:col-span-6 p-4 rounded-2xl border space-y-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Spending by Category
              </h3>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Click any category to filter the ledger
              </p>
            </div>
            {activeCategoryFilter !== "all" && (
              <button
                type="button"
                onClick={() => onSelectCategoryFilter("all")}
                className="text-[11px] font-medium hover:underline cursor-pointer"
                style={{ color: "var(--accent)" }}
              >
                Clear filter
              </button>
            )}
          </div>

          {categoryBreakdown.rows.length === 0 ? (
            <div className="h-28 flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>
              No expenses recorded in {currency} for this period.
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* SVG Donut */}
              <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="var(--border-subtle)"
                    strokeWidth="12"
                  />
                  {donutSegments.map((seg) => (
                    <circle
                      key={seg.id}
                      cx="50"
                      cy="50"
                      r="38"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="12"
                      strokeDasharray={seg.strokeDasharray}
                      strokeDashoffset={seg.strokeDashoffset}
                      className="cursor-pointer transition-opacity hover:opacity-80"
                      onClick={() =>
                        onSelectCategoryFilter(
                          activeCategoryFilter === seg.id ? "all" : seg.id,
                        )
                      }
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2 text-center">
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Total
                  </span>
                  <span className="text-[11px] font-bold font-mono tabular-nums truncate max-w-[68px]">
                    {formatFinanceAmount(categoryBreakdown.totalExp, currency, {
                      compact: true,
                    })}
                  </span>
                </div>
              </div>

              {/* Ranked Bars */}
              <div className="flex-1 w-full space-y-2 max-h-32 overflow-y-auto pr-1">
                {categoryBreakdown.rows.map((row) => {
                  const isActive = activeCategoryFilter === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() =>
                        onSelectCategoryFilter(isActive ? "all" : row.id)
                      }
                      className="w-full text-left space-y-1 p-1 rounded-lg transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                      style={{
                        backgroundColor: isActive
                          ? "var(--accent-soft)"
                          : undefined,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 min-w-0 truncate font-medium">
                          <FinanceIcon
                            name={row.icon}
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: row.color }}
                          />
                          <span className="truncate">{row.name}</span>
                        </span>
                        <span className="font-mono tabular-nums shrink-0 text-[11px]">
                          {formatFinanceAmount(row.amount, currency)}{" "}
                          <span style={{ color: "var(--text-muted)" }}>
                            ({Math.round(row.pct)}%)
                          </span>
                        </span>
                      </div>
                      <div
                        className="h-1.5 w-full rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--bg-surface-subtle)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(3, row.pct)}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
