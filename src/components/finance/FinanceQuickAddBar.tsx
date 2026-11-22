import React, { useMemo, useState } from "react";
import { ArrowRightLeft, Plus, SlidersHorizontal, Sparkles } from "lucide-react";
import {
  formatFinanceAmount,
  parseFinanceQuickInput,
  type ParsedFinanceQuickInput,
} from "../../lib/financeUtils";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceCurrency,
  FinanceTransaction,
} from "../../types/finance";
import { formatRelativeDayLabel } from "../../utils/date";

interface FinanceQuickAddBarProps {
  activeCurrency: FinanceCurrency;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  onSubmitTransaction: (
    draft: Omit<FinanceTransaction, "id" | "createdAt" | "updatedAt">,
  ) => void;
  onOpenDetailedDrawer: (prefill?: ParsedFinanceQuickInput) => void;
}

export const FinanceQuickAddBar: React.FC<FinanceQuickAddBarProps> = ({
  activeCurrency,
  accounts,
  categories,
  onSubmitTransaction,
  onOpenDetailedDrawer,
}) => {
  const [input, setInput] = useState("");

  const parsed = useMemo(
    () =>
      parseFinanceQuickInput(input, accounts, categories, activeCurrency),
    [input, accounts, categories, activeCurrency],
  );

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const canSubmit =
    parsed.amount !== null &&
    parsed.amount > 0 &&
    Boolean(parsed.accountId) &&
    (parsed.type !== "transfer" || Boolean(parsed.toAccountId));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) {
      onOpenDetailedDrawer();
      return;
    }
    if (!canSubmit || parsed.amount === null || !parsed.accountId) {
      onOpenDetailedDrawer(parsed);
      return;
    }

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");

    onSubmitTransaction({
      type: parsed.type,
      amount: parsed.amount,
      currency: parsed.currency,
      accountId: parsed.accountId,
      toAccountId: parsed.type === "transfer" ? parsed.toAccountId : null,
      categoryId: parsed.type === "transfer" ? null : parsed.categoryId,
      merchant: parsed.merchant || (parsed.type === "transfer" ? "Transfer" : ""),
      dateKey: parsed.dateKey,
      timeHHMM: `${hh}:${mm}`,
      tags: parsed.tags,
    });
    setInput("");
  };

  const fromAcc = parsed.accountId ? accountMap.get(parsed.accountId) : null;
  const toAcc = parsed.toAccountId ? accountMap.get(parsed.toAccountId) : null;
  const cat = parsed.categoryId ? categoryMap.get(parsed.categoryId) : null;

  return (
    <div
      className="rounded-2xl border p-3 space-y-2"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0 flex items-center">
          <Sparkles
            className="w-4 h-4 absolute left-3 pointer-events-none"
            style={{ color: "var(--accent)" }}
          />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Quick log: "-45k coffee @cash #food" · "+2500 usd salary @mercury" · "transfer 500k @vietcom to @cash"`}
            className="w-full h-10 pl-9 pr-3 rounded-xl border text-xs sm:text-sm outline-none focus:border-[var(--accent)]"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)",
            }}
          />
        </div>

        <button
          type="button"
          onClick={() =>
            onOpenDetailedDrawer(input.trim() ? parsed : undefined)
          }
          className="h-10 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-subtle)] whitespace-nowrap shrink-0 cursor-pointer"
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
          title="Open detailed transaction drawer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Full Form</span>
        </button>

        <button
          type="submit"
          disabled={Boolean(input.trim()) && !canSubmit}
          className="h-10 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-45 cursor-pointer"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--accent-fg)",
          }}
        >
          <Plus className="w-4 h-4" />
          <span>{input.trim() ? "Log" : "Add"}</span>
        </button>
      </form>

      {input.trim() && (
        <div
          className="flex flex-wrap items-center gap-2 text-[11px] px-1"
          style={{ color: "var(--text-secondary)" }}
        >
          <span
            className="font-semibold uppercase tracking-wider"
            style={{
              color:
                parsed.type === "income"
                  ? "var(--success)"
                  : parsed.type === "transfer"
                    ? "var(--accent)"
                    : "var(--danger)",
            }}
          >
            {parsed.type}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono font-semibold tabular-nums">
            {parsed.amount !== null
              ? formatFinanceAmount(parsed.amount, parsed.currency)
              : "Amount needed"}
          </span>
          {parsed.merchant && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium truncate max-w-[180px]">
                {parsed.merchant}
              </span>
            </>
          )}
          {fromAcc && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <span>@{fromAcc.name}</span>
                {parsed.type === "transfer" && (
                  <>
                    <ArrowRightLeft className="w-3 h-3" />
                    <span>{toAcc ? `@${toAcc.name}` : "pick @target"}</span>
                  </>
                )}
              </span>
            </>
          )}
          {cat && parsed.type !== "transfer" && (
            <>
              <span aria-hidden="true">·</span>
              <span style={{ color: cat.color }}>#{cat.name}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="font-mono">{formatRelativeDayLabel(parsed.dateKey)}</span>
        </div>
      )}
    </div>
  );
};
