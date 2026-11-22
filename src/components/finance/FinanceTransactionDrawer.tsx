import React, { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import {
  FINANCE_CURRENCIES,
  FINANCE_CURRENCY_META,
  type ParsedFinanceQuickInput,
} from "../../lib/financeUtils";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceCurrency,
  FinanceTransaction,
  FinanceTransactionType,
} from "../../types/finance";
import { getTodayKey } from "../../utils/date";
import { FinanceIcon } from "./FinanceIcon";

interface FinanceTransactionDrawerProps {
  open: boolean;
  editingTransaction: FinanceTransaction | null;
  prefill?: ParsedFinanceQuickInput | null;
  defaultCurrency: FinanceCurrency;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  onSave: (
    draft: Omit<FinanceTransaction, "id" | "createdAt" | "updatedAt">,
    existingId?: string,
  ) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export const FinanceTransactionDrawer: React.FC<
  FinanceTransactionDrawerProps
> = ({
  open,
  editingTransaction,
  prefill,
  defaultCurrency,
  accounts,
  categories,
  onSave,
  onDelete,
  onClose,
}) => {
  const [type, setType] = useState<FinanceTransactionType>("expense");
  const [amountStr, setAmountStr] = useState("");
  const [currency, setCurrency] = useState<FinanceCurrency>(defaultCurrency);
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [toAmountStr, setToAmountStr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [dateKey, setDateKey] = useState(getTodayKey());
  const [timeHHMM, setTimeHHMM] = useState("09:00");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);

    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmountStr(String(editingTransaction.amount));
      setCurrency(editingTransaction.currency);
      setAccountId(editingTransaction.accountId);
      setToAccountId(editingTransaction.toAccountId || "");
      setToAmountStr(
        editingTransaction.toAmount != null
          ? String(editingTransaction.toAmount)
          : "",
      );
      setCategoryId(editingTransaction.categoryId || "");
      setMerchant(editingTransaction.merchant || "");
      setNote(editingTransaction.note || "");
      setDateKey(editingTransaction.dateKey);
      setTimeHHMM(editingTransaction.timeHHMM || "");
      return;
    }

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const cur = prefill?.currency || defaultCurrency;
    const activeAccounts = accounts.filter((a) => !a.archived);
    const matchedAcc =
      (prefill?.accountId && accounts.find((a) => a.id === prefill.accountId)) ||
      activeAccounts.find((a) => a.currency === cur) ||
      activeAccounts[0];
    const secondAcc =
      (prefill?.toAccountId &&
        accounts.find((a) => a.id === prefill.toAccountId)) ||
      activeAccounts.find((a) => a.id !== matchedAcc?.id);

    setType(prefill?.type || "expense");
    setAmountStr(prefill?.amount ? String(prefill.amount) : "");
    setCurrency(cur);
    setAccountId(matchedAcc?.id || "");
    setToAccountId(secondAcc?.id || "");
    setToAmountStr("");
    setCategoryId(prefill?.categoryId || "");
    setMerchant(prefill?.merchant || "");
    setNote("");
    setDateKey(prefill?.dateKey || getTodayKey());
    setTimeHHMM(`${hh}:${mm}`);
  }, [open, editingTransaction, prefill, defaultCurrency, accounts]);

  if (!open) return null;

  const filteredCategories = categories.filter(
    (c) => c.kind === (type === "income" ? "income" : "expense"),
  );
  const fromAccount = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const crossCurrencyTransfer =
    type === "transfer" &&
    fromAccount &&
    toAccount &&
    fromAccount.currency !== toAccount.currency;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number.parseFloat(amountStr);
    if (Number.isNaN(amount) || amount <= 0 || !accountId) return;
    if (type === "transfer" && (!toAccountId || toAccountId === accountId)) {
      return;
    }
    const parsedToAmount = Number.parseFloat(toAmountStr);
    onSave(
      {
        type,
        amount,
        currency,
        accountId,
        toAccountId: type === "transfer" ? toAccountId : null,
        toAmount:
          crossCurrencyTransfer &&
          !Number.isNaN(parsedToAmount) &&
          parsedToAmount > 0
            ? parsedToAmount
            : null,
        categoryId: type === "transfer" ? null : categoryId || null,
        merchant: merchant.trim(),
        note: note.trim(),
        dateKey,
        timeHHMM: timeHHMM || null,
      },
      editingTransaction?.id,
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-label={editingTransaction ? "Edit transaction" : "Add transaction"}
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full sm:max-w-lg max-h-[92dvh] rounded-t-2xl sm:rounded-2xl border overflow-hidden flex flex-col pb-safe sm:pb-0"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-subtle)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div
          className="px-4 sm:px-5 py-3.5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <h2 className="font-display text-base font-bold">
            {editingTransaction ? "Edit Transaction" : "New Transaction"}
          </h2>
          <div className="flex items-center gap-1">
            {editingTransaction && onDelete && (
              confirmDelete ? (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(editingTransaction.id);
                      onClose();
                    }}
                    className="h-8 px-2.5 rounded-lg text-xs font-semibold text-white cursor-pointer"
                    style={{ backgroundColor: "var(--danger)" }}
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="h-8 px-2 rounded-lg text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{ color: "var(--danger)" }}
                  aria-label="Delete transaction"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Type Segmented Switch */}
          <div
            className="grid grid-cols-3 gap-1 p-1 rounded-xl border"
            style={{
              backgroundColor: "var(--bg-surface-subtle)",
              borderColor: "var(--border-subtle)",
            }}
          >
            {(["expense", "income", "transfer"] as FinanceTransactionType[]).map(
              (t) => {
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className="h-8 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? "var(--bg-elevated)"
                        : "transparent",
                      color: active
                        ? t === "income"
                          ? "var(--success)"
                          : t === "expense"
                            ? "var(--danger)"
                            : "var(--accent)"
                        : "var(--text-muted)",
                      boxShadow: active ? "var(--shadow-sm)" : undefined,
                    }}
                  >
                    {t}
                  </button>
                );
              },
            )}
          </div>

          {/* Amount & Currency */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-8">
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                Amount ({FINANCE_CURRENCY_META[currency].symbol})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder={currency === "VND" ? "50000" : "24.50"}
                className="w-full h-11 px-3 rounded-xl border text-base font-bold font-mono tabular-nums outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>

            <div className="col-span-4">
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as FinanceCurrency)}
                className="w-full h-11 px-2.5 rounded-xl border text-xs font-mono font-semibold outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                {FINANCE_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c} ({FINANCE_CURRENCY_META[c].symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Accounts */}
          <div className={type === "transfer" ? "grid grid-cols-1 sm:grid-cols-2 gap-2.5" : ""}>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                {type === "transfer" ? "From Account" : "Account / Wallet"}
              </label>
              <select
                value={accountId}
                required
                onChange={(e) => {
                  setAccountId(e.target.value);
                  const chosen = accounts.find((a) => a.id === e.target.value);
                  if (chosen && !editingTransaction) {
                    setCurrency(chosen.currency);
                  }
                }}
                className="w-full h-9 px-2.5 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                {accounts.length === 0 && (
                  <option value="">Create an account first</option>
                )}
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>

            {type === "transfer" && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                  To Account
                </label>
                <select
                  value={toAccountId}
                  required
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <option value="">Select destination...</option>
                  {accounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {crossCurrencyTransfer && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                Converted Amount Received ({toAccount?.currency})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={toAmountStr}
                onChange={(e) => setToAmountStr(e.target.value)}
                placeholder={`Optional received amount in ${toAccount?.currency}`}
                className="w-full h-9 px-3 rounded-xl border text-xs font-mono outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>
          )}

          {/* Category grid for Expense / Income */}
          {type !== "transfer" && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                Category
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                {filteredCategories.map((cat) => {
                  const selected = categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(selected ? "" : cat.id)}
                      className="h-9 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 transition-colors truncate cursor-pointer"
                      style={{
                        backgroundColor: selected
                          ? "var(--accent-soft)"
                          : "var(--bg-surface)",
                        borderColor: selected
                          ? cat.color
                          : "var(--border-subtle)",
                      }}
                    >
                      <FinanceIcon
                        name={cat.icon}
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: cat.color }}
                      />
                      <span className="truncate">{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Merchant & Date/Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                Merchant / Title
              </label>
              <input
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder={
                  type === "transfer"
                    ? "ATM withdrawal, savings transfer..."
                    : "Coffee shop, grocery store, client..."
                }
                className="w-full h-9 px-3 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                Date
              </label>
              <input
                type="date"
                required
                value={dateKey}
                onChange={(e) => setDateKey(e.target.value)}
                className="w-full h-9 px-2.5 rounded-xl border text-xs font-mono outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                Time
              </label>
              <input
                type="time"
                value={timeHHMM}
                onChange={(e) => setTimeHHMM(e.target.value)}
                className="w-full h-9 px-2.5 rounded-xl border text-xs font-mono outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
              Note
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional memo or receipt note..."
              className="w-full p-2.5 rounded-xl border text-xs resize-none outline-none focus:border-[var(--accent)]"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            />
          </div>
        </div>

        <div
          className="px-4 sm:px-5 py-3 border-t flex items-center justify-end gap-2 shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3.5 rounded-xl text-xs font-medium hover:bg-[var(--bg-surface-subtle)]"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={accounts.length === 0}
            className="h-9 px-4 rounded-xl text-xs font-semibold disabled:opacity-45 cursor-pointer"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            {editingTransaction ? "Save Changes" : "Save Transaction"}
          </button>
        </div>
      </form>
    </div>
  );
};
