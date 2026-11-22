import React, { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  FastForward,
  Pause,
  Play,
  Plus,
  Repeat,
  Trash2,
  X,
} from "lucide-react";
import {
  daysUntilDateKey,
  FINANCE_CURRENCIES,
  formatFinanceAmount,
  getMonthlyNormalizedAmount,
} from "../../lib/financeUtils";
import type {
  FinanceAccount,
  FinanceBillingCycle,
  FinanceCategory,
  FinanceCurrency,
  FinanceSubscription,
} from "../../types/finance";
import { formatShortDate, getTodayKey } from "../../utils/date";
import { FinanceIcon } from "./FinanceIcon";

interface FinanceSubscriptionsTabProps {
  activeCurrency: FinanceCurrency;
  subscriptions: FinanceSubscription[];
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  onAddSubscription: (
    draft: Omit<FinanceSubscription, "id" | "createdAt" | "updatedAt">,
  ) => void;
  onUpdateSubscription: (
    id: string,
    patch: Partial<FinanceSubscription>,
  ) => void;
  onDeleteSubscription: (id: string) => void;
  onLogNow: (id: string) => void;
  onSkipCycle: (id: string) => void;
}

const CYCLE_LABELS: Record<FinanceBillingCycle, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export const FinanceSubscriptionsTab: React.FC<
  FinanceSubscriptionsTabProps
> = ({
  activeCurrency,
  subscriptions,
  accounts,
  categories,
  onAddSubscription,
  onUpdateSubscription,
  onDeleteSubscription,
  onLogNow,
  onSkipCycle,
}) => {
  const todayKey = getTodayKey();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<FinanceSubscription | null>(
    null,
  );
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [currency, setCurrency] = useState<FinanceCurrency>(activeCurrency);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [billingCycle, setBillingCycle] =
    useState<FinanceBillingCycle>("monthly");
  const [nextDueDate, setNextDueDate] = useState(todayKey);
  const [autoLog, setAutoLog] = useState(true);
  const [notes, setNotes] = useState("");

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind === "expense"),
    [categories],
  );

  const sortedSubs = useMemo(() => {
    return [...subscriptions].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a.currency === activeCurrency && b.currency !== activeCurrency)
        return -1;
      if (b.currency === activeCurrency && a.currency !== activeCurrency)
        return 1;
      return a.nextDueDate.localeCompare(b.nextDueDate);
    });
  }, [subscriptions, activeCurrency]);

  const activeCurrencyRunRate = useMemo(() => {
    let monthly = 0;
    let activeCount = 0;
    for (const s of subscriptions) {
      if (!s.active || s.currency !== activeCurrency) continue;
      monthly += getMonthlyNormalizedAmount(s.amount, s.billingCycle);
      activeCount++;
    }
    return { monthly, yearly: monthly * 12, activeCount };
  }, [subscriptions, activeCurrency]);

  const openCreateModal = () => {
    const defAcc =
      accounts.find((a) => !a.archived && a.currency === activeCurrency) ||
      accounts[0];
    const subsCat =
      expenseCategories.find((c) => /sub/i.test(c.name)) ||
      expenseCategories[0];
    setEditingSub(null);
    setName("");
    setAmountStr("");
    setCurrency(activeCurrency);
    setAccountId(defAcc?.id || "");
    setCategoryId(subsCat?.id || "");
    setBillingCycle("monthly");
    setNextDueDate(todayKey);
    setAutoLog(true);
    setNotes("");
    setModalOpen(true);
  };

  const openEditModal = (sub: FinanceSubscription) => {
    setEditingSub(sub);
    setName(sub.name);
    setAmountStr(String(sub.amount));
    setCurrency(sub.currency);
    setAccountId(sub.accountId);
    setCategoryId(sub.categoryId);
    setBillingCycle(sub.billingCycle);
    setNextDueDate(sub.nextDueDate);
    setAutoLog(sub.autoLog);
    setNotes(sub.notes || "");
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number.parseFloat(amountStr);
    if (!name.trim() || Number.isNaN(amount) || amount <= 0 || !accountId) {
      return;
    }
    const payload = {
      name: name.trim(),
      amount,
      currency,
      accountId,
      categoryId: categoryId || expenseCategories[0]?.id || "",
      billingCycle,
      nextDueDate,
      autoLog,
      active: editingSub ? editingSub.active : true,
      notes: notes.trim(),
    };
    if (editingSub) {
      onUpdateSubscription(editingSub.id, payload);
    } else {
      onAddSubscription(payload);
    }
    setModalOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Run-Rate Header Banner */}
      <div
        className="p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Monthly Run-Rate ({activeCurrency})
            </div>
            <div className="text-xl font-bold font-mono tabular-nums mt-0.5">
              {formatFinanceAmount(activeCurrencyRunRate.monthly, activeCurrency)}
            </div>
          </div>
          <div className="pl-6 border-l" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Annualized ({activeCurrency})
            </div>
            <div className="text-xl font-bold font-mono tabular-nums mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {formatFinanceAmount(activeCurrencyRunRate.yearly, activeCurrency)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--accent-fg)",
          }}
        >
          <Plus className="w-4 h-4" />
          <span>Add Subscription</span>
        </button>
      </div>

      {/* Subscriptions Grid */}
      {sortedSubs.length === 0 ? (
        <div
          className="p-8 rounded-2xl border text-center space-y-2"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <Repeat
            className="w-8 h-8 mx-auto"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm font-semibold">No recurring bills tracked yet</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Add streaming plans, cloud tools, or rent to track renewals and enable auto-logging.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sortedSubs.map((sub) => {
            const cat = categoryMap.get(sub.categoryId);
            const acc = accountMap.get(sub.accountId);
            const days = daysUntilDateKey(sub.nextDueDate, todayKey);
            const dueLabel =
              days < 0
                ? `Overdue ${Math.abs(days)}d`
                : days === 0
                  ? "Due today"
                  : days === 1
                    ? "Due tomorrow"
                    : `In ${days}d`;

            return (
              <div
                key={sub.id}
                className={`p-4 rounded-2xl border space-y-3 transition-opacity ${
                  sub.active ? "" : "opacity-60"
                }`}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor:
                    sub.active && days <= 3
                      ? "var(--accent)"
                      : "var(--border-subtle)",
                }}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <button
                    type="button"
                    onClick={() => openEditModal(sub)}
                    className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: "var(--bg-surface-subtle)",
                        color: cat?.color || "var(--accent)",
                      }}
                    >
                      <FinanceIcon name={cat?.icon || "Repeat"} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-sm truncate">
                        {sub.name}
                      </div>
                      <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                        {CYCLE_LABELS[sub.billingCycle]} · {acc?.name || "Account"}
                        {!sub.active ? " · Paused" : ""}
                      </div>
                    </div>
                  </button>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold font-mono tabular-nums">
                      {formatFinanceAmount(sub.amount, sub.currency)}
                    </div>
                    <div
                      className="text-[11px] font-mono tabular-nums"
                      style={{
                        color:
                          days <= 0 && sub.active
                            ? "var(--danger)"
                            : days <= 3 && sub.active
                              ? "var(--accent)"
                              : "var(--text-muted)",
                      }}
                    >
                      {dueLabel} · {formatShortDate(sub.nextDueDate)}
                    </div>
                  </div>
                </div>

                <div
                  className="pt-2.5 border-t flex flex-wrap items-center justify-between gap-2"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                    <input
                      type="checkbox"
                      checked={sub.autoLog}
                      onChange={(e) =>
                        onUpdateSubscription(sub.id, {
                          autoLog: e.target.checked,
                        })
                      }
                      className="w-3.5 h-3.5 accent-[var(--accent)]"
                    />
                    <span>Auto-log when due</span>
                  </label>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onLogNow(sub.id)}
                      className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        borderColor: "var(--border-subtle)",
                      }}
                      title="Record payment now and advance due date"
                    >
                      <CheckCircle2 className="w-3 h-3" style={{ color: "var(--success)" }} />
                      <span>Log Now</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSkipCycle(sub.id)}
                      className="h-7 px-2 rounded-lg border text-[11px] inline-flex items-center gap-1 hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                      title="Skip cycle without logging"
                    >
                      <FastForward className="w-3 h-3" />
                      <span>Skip</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSubscription(sub.id, { active: !sub.active })
                      }
                      className="h-7 w-7 flex items-center justify-center rounded-lg border hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-muted)",
                      }}
                      title={sub.active ? "Pause subscription" : "Resume subscription"}
                    >
                      {sub.active ? (
                        <Pause className="w-3 h-3" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteSubscription(sub.id)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                      title="Delete subscription"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Subscription Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 overscroll-none"
          role="dialog"
          aria-modal="true"
          aria-label="Subscription editor"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setModalOpen(false)}
            aria-hidden="true"
          />
          <form
            onSubmit={handleSave}
            className="relative z-10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border overflow-hidden flex flex-col pb-safe sm:pb-0"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div
              className="px-4 py-3.5 border-b flex items-center justify-between"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <h3 className="font-display text-base font-bold">
                  {editingSub ? "Edit Subscription" : "New Subscription"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                  Service Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Spotify, Rent, Gym, iCloud..."
                  className="w-full h-9 px-3 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                />
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-7">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                    Amount
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border text-xs font-mono outline-none focus:border-[var(--accent)]"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  />
                </div>
                <div className="col-span-5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) =>
                      setCurrency(e.target.value as FinanceCurrency)
                    }
                    className="w-full h-9 px-2.5 rounded-xl border text-xs font-mono outline-none focus:border-[var(--accent)]"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {FINANCE_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                    Billing Cycle
                  </label>
                  <select
                    value={billingCycle}
                    onChange={(e) =>
                      setBillingCycle(e.target.value as FinanceBillingCycle)
                    }
                    className="w-full h-9 px-2.5 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                    Next Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={nextDueDate}
                    onChange={(e) => setNextDueDate(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl border text-xs font-mono outline-none focus:border-[var(--accent)]"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                    Account
                  </label>
                  <select
                    value={accountId}
                    required
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                    Category
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {expenseCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center justify-between gap-2 pt-1 cursor-pointer">
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Auto-log expense automatically on renewal date
                </span>
                <input
                  type="checkbox"
                  checked={autoLog}
                  onChange={(e) => setAutoLog(e.target.checked)}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
              </label>
            </div>

            <div
              className="px-4 py-3 border-t flex justify-end gap-2"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-9 px-3 rounded-xl text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={accounts.length === 0}
                className="h-9 px-4 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-45"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                {editingSub ? "Save" : "Add Subscription"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
