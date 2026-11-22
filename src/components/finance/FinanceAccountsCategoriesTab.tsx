import React, { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  computeAccountBalance,
  FINANCE_CURRENCIES,
  formatFinanceAmount,
} from "../../lib/financeUtils";
import type {
  FinanceAccount,
  FinanceAccountType,
  FinanceCategory,
  FinanceCategoryKind,
  FinanceCurrency,
  FinanceTransaction,
} from "../../types/finance";
import {
  FINANCE_ACCOUNT_ICON_OPTIONS,
  FINANCE_CATEGORY_ICON_OPTIONS,
  FINANCE_COLOR_SWATCHES,
  FinanceIcon,
} from "./FinanceIcon";

interface FinanceAccountsCategoriesTabProps {
  activeCurrency: FinanceCurrency;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  transactions: FinanceTransaction[];
  onAddAccount: (
    draft: Omit<FinanceAccount, "id" | "createdAt" | "updatedAt">,
  ) => void;
  onUpdateAccount: (id: string, patch: Partial<FinanceAccount>) => void;
  onDeleteAccount: (id: string) => void;
  onAddCategory: (
    draft: Omit<FinanceCategory, "id" | "createdAt" | "updatedAt">,
  ) => void;
  onUpdateCategory: (id: string, patch: Partial<FinanceCategory>) => void;
  onDeleteCategory: (id: string) => void;
}

export const FinanceAccountsCategoriesTab: React.FC<
  FinanceAccountsCategoriesTabProps
> = ({
  activeCurrency,
  accounts,
  categories,
  transactions,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
}) => {
  // New Account form
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<FinanceAccountType>("bank");
  const [accCurrency, setAccCurrency] =
    useState<FinanceCurrency>(activeCurrency);
  const [accInitialStr, setAccInitialStr] = useState("0");
  const [accIcon, setAccIcon] = useState<string>("Landmark");
  const [accColor, setAccColor] = useState<string>(FINANCE_COLOR_SWATCHES[2]);

  // New Category form
  const [catName, setCatName] = useState("");
  const [catKind, setCatKind] = useState<FinanceCategoryKind>("expense");
  const [catIcon, setCatIcon] = useState<string>("Utensils");
  const [catColor, setCatColor] = useState<string>(FINANCE_COLOR_SWATCHES[0]);

  const accountBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const acc of accounts) {
      map.set(acc.id, computeAccountBalance(acc, transactions));
    }
    return map;
  }, [accounts, transactions]);

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    const initialBalance = Number.parseFloat(accInitialStr) || 0;
    onAddAccount({
      name: accName.trim(),
      type: accType,
      currency: accCurrency,
      initialBalance,
      icon: accIcon,
      color: accColor,
    });
    setAccName("");
    setAccInitialStr("0");
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    onAddCategory({
      name: catName.trim(),
      kind: catKind,
      icon: catIcon,
      color: catColor,
    });
    setCatName("");
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* Accounts / Wallets */}
      <section className="xl:col-span-6 space-y-3">
        <div>
          <h3 className="font-display text-base font-bold">
            Accounts &amp; Wallets
          </h3>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Track bank accounts, credit cards, cash wallets, and multi-currency balances
          </p>
        </div>

        <form
          onSubmit={handleCreateAccount}
          className="p-3.5 rounded-2xl border space-y-2.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="grid grid-cols-12 gap-2">
            <input
              type="text"
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              placeholder="Account name (e.g. Cash Wallet)"
              className="col-span-6 h-9 px-2.5 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-subtle)",
              }}
            />
            <select
              value={accType}
              onChange={(e) =>
                setAccType(e.target.value as FinanceAccountType)
              }
              className="col-span-3 h-9 px-2 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <option value="bank">Bank</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
              <option value="savings">Savings</option>
              <option value="wallet">Wallet</option>
            </select>
            <select
              value={accCurrency}
              onChange={(e) =>
                setAccCurrency(e.target.value as FinanceCurrency)
              }
              className="col-span-3 h-9 px-2 rounded-xl border text-xs font-mono outline-none focus:border-[var(--accent)]"
              style={{
                backgroundColor: "var(--bg-elevated)",
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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Starting balance:
              </span>
              <input
                type="number"
                step="any"
                value={accInitialStr}
                onChange={(e) => setAccInitialStr(e.target.value)}
                className="w-28 h-8 px-2 rounded-lg border text-xs font-mono outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>

            <div className="flex items-center gap-1">
              {FINANCE_ACCOUNT_ICON_OPTIONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setAccIcon(ic)}
                  className="w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor:
                      accIcon === ic ? "var(--accent-soft)" : "var(--bg-elevated)",
                    borderColor:
                      accIcon === ic ? accColor : "var(--border-subtle)",
                    color: accIcon === ic ? accColor : "var(--text-muted)",
                  }}
                >
                  <FinanceIcon name={ic} className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="h-8 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 pt-0.5">
            {FINANCE_COLOR_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setAccColor(hex)}
                className={`w-5 h-5 rounded-full border-2 cursor-pointer ${
                  accColor === hex ? "scale-110" : "opacity-70"
                }`}
                style={{
                  backgroundColor: hex,
                  borderColor:
                    accColor === hex ? "var(--text-primary)" : "transparent",
                }}
                aria-label={`Account color ${hex}`}
              />
            ))}
          </div>
        </form>

        <div className="space-y-2">
          {accounts.map((acc) => {
            const bal = accountBalances.get(acc.id) ?? acc.initialBalance;
            return (
              <div
                key={acc.id}
                className="p-3 rounded-2xl border flex items-center justify-between gap-2.5"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: "var(--bg-surface-subtle)",
                      color: acc.color,
                    }}
                  >
                    <FinanceIcon name={acc.icon} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={acc.name}
                      onChange={(e) =>
                        onUpdateAccount(acc.id, { name: e.target.value })
                      }
                      className="w-full text-xs font-semibold bg-transparent outline-none focus:underline"
                    />
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {acc.type} · {acc.currency}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div
                    className="text-sm font-bold font-mono tabular-nums"
                    style={{
                      color: bal < 0 ? "var(--danger)" : "var(--text-primary)",
                    }}
                  >
                    {formatFinanceAmount(bal, acc.currency)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteAccount(acc.id)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] shrink-0 cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                  title="Delete account"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Customizable Categories */}
      <section className="xl:col-span-6 space-y-3">
        <div>
          <h3 className="font-display text-base font-bold">
            Custom Categories
          </h3>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Customize expense and income categories with icons and colors
          </p>
        </div>

        <form
          onSubmit={handleCreateCategory}
          className="p-3.5 rounded-2xl border space-y-2.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="grid grid-cols-12 gap-2">
            <input
              type="text"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="Category name (e.g. Coffee, Travel)"
              className="col-span-7 h-9 px-2.5 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-subtle)",
              }}
            />
            <select
              value={catKind}
              onChange={(e) =>
                setCatKind(e.target.value as FinanceCategoryKind)
              }
              className="col-span-3 h-9 px-2 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <button
              type="submit"
              className="col-span-2 h-9 px-2.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {FINANCE_CATEGORY_ICON_OPTIONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setCatIcon(ic)}
                className="w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor:
                    catIcon === ic ? "var(--accent-soft)" : "var(--bg-elevated)",
                  borderColor:
                    catIcon === ic ? catColor : "var(--border-subtle)",
                  color: catIcon === ic ? catColor : "var(--text-muted)",
                }}
              >
                <FinanceIcon name={ic} className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {FINANCE_COLOR_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setCatColor(hex)}
                className={`w-5 h-5 rounded-full border-2 cursor-pointer ${
                  catColor === hex ? "scale-110" : "opacity-70"
                }`}
                style={{
                  backgroundColor: hex,
                  borderColor:
                    catColor === hex ? "var(--text-primary)" : "transparent",
                }}
                aria-label={`Category color ${hex}`}
              />
            ))}
          </div>
        </form>

        <div className="space-y-2 max-h-[440px] overflow-y-auto pr-0.5">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="p-2.5 rounded-2xl border flex items-center justify-between gap-2.5"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    color: cat.color,
                  }}
                >
                  <FinanceIcon name={cat.icon} className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={cat.name}
                  onChange={(e) =>
                    onUpdateCategory(cat.id, { name: e.target.value })
                  }
                  className="flex-1 min-w-0 text-xs font-semibold bg-transparent outline-none focus:underline"
                />
              </div>

              <span
                className="text-[11px] font-medium capitalize shrink-0"
                style={{
                  color:
                    cat.kind === "income"
                      ? "var(--success)"
                      : "var(--text-muted)",
                }}
              >
                {cat.kind}
              </span>

              <input
                type="color"
                value={cat.color}
                onChange={(e) =>
                  onUpdateCategory(cat.id, { color: e.target.value })
                }
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent shrink-0"
                aria-label={`Color for ${cat.name}`}
              />

              <button
                type="button"
                onClick={() => onDeleteCategory(cat.id)}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] shrink-0 cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                title="Delete category"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
