import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  ListFilter,
  Plus,
  ReceiptText,
  Repeat,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { FinanceAccountsCategoriesTab } from "../components/finance/FinanceAccountsCategoriesTab";
import { FinanceAnalyticsStrip } from "../components/finance/FinanceAnalyticsStrip";
import { FinanceCalendarView } from "../components/finance/FinanceCalendarView";
import { FinanceCsvImportModal } from "../components/finance/FinanceCsvImportModal";
import { FinanceIcon } from "../components/finance/FinanceIcon";
import { FinanceQuickAddBar } from "../components/finance/FinanceQuickAddBar";
import { FinanceSubscriptionsTab } from "../components/finance/FinanceSubscriptionsTab";
import { FinanceTransactionDrawer } from "../components/finance/FinanceTransactionDrawer";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  computeAccountBalance,
  FINANCE_CURRENCIES,
  FINANCE_CURRENCY_META,
  type FinancePeriodMode,
  formatFinanceAmount,
  getPeriodBounds,
  type ParsedFinanceQuickInput,
  shiftPeriodAnchor,
} from "../lib/financeUtils";
import type {
  FinanceTransaction,
  FinanceTransactionType,
} from "../types/finance";
import { formatCompactDayHeading, getTodayKey } from "../utils/date";
import { VIEW_PREFERENCE_SYNC_EVENT } from "../utils/viewPreferences";

const FINANCE_PREFS_KEY = "kanso_finance_prefs_v1";

type FinanceSubTab = "ledger" | "calendar" | "subscriptions" | "accounts";

interface FinancePrefs {
  subTab: FinanceSubTab;
  periodMode: FinancePeriodMode;
  showAllWalletCurrencies: boolean;
}

function loadFinancePrefs(): FinancePrefs {
  try {
    const raw = localStorage.getItem(FINANCE_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FinancePrefs>;
      const validTab: FinanceSubTab =
        parsed.subTab === "calendar" ||
        parsed.subTab === "subscriptions" ||
        parsed.subTab === "accounts"
          ? parsed.subTab
          : "ledger";
      const validPeriod: FinancePeriodMode =
        parsed.periodMode === "day" ||
        parsed.periodMode === "week" ||
        parsed.periodMode === "month" ||
        parsed.periodMode === "year" ||
        parsed.periodMode === "all"
          ? parsed.periodMode
          : "month";
      return {
        subTab: validTab,
        periodMode: validPeriod,
        showAllWalletCurrencies: Boolean(parsed.showAllWalletCurrencies),
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return {
    subTab: "ledger",
    periodMode: "month",
    showAllWalletCurrencies: false,
  };
}

const PERIOD_MODES: { id: FinancePeriodMode; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "all", label: "All" },
];

export const FinanceView: React.FC = () => {
  const {
    workspace,
    addFinanceAccount,
    updateFinanceAccount,
    deleteFinanceAccount,
    addFinanceCategory,
    updateFinanceCategory,
    deleteFinanceCategory,
    addFinanceTransaction,
    updateFinanceTransaction,
    deleteFinanceTransaction,
    importFinanceTransactions,
    addFinanceSubscription,
    updateFinanceSubscription,
    deleteFinanceSubscription,
    logFinanceSubscriptionNow,
    skipFinanceSubscriptionCycle,
    runDueFinanceSubscriptions,
    updateFinanceSettings,
    pushToast,
  } = useWorkspace();

  const accounts = workspace.financeAccounts ?? [];
  const categories = workspace.financeCategories ?? [];
  const transactions = workspace.financeTransactions ?? [];
  const subscriptions = workspace.financeSubscriptions ?? [];
  const activeCurrency = workspace.financeSettings?.activeCurrency ?? "USD";

  const todayKey = getTodayKey();
  const [prefs, setPrefs] = useState<FinancePrefs>(loadFinancePrefs);
  const [anchorDateKey, setAnchorDateKey] = useState<string>(todayKey);
  const [selectedCalendarDayKey, setSelectedCalendarDayKey] =
    useState<string>(todayKey);

  // Ledger filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<FinanceTransactionType | "all">(
    "all",
  );
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Modals & drawers
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<FinanceTransaction | null>(null);
  const [quickPrefill, setQuickPrefill] =
    useState<ParsedFinanceQuickInput | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);

  // Persist prefs
  useEffect(() => {
    try {
      localStorage.setItem(FINANCE_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage write errors
    }
  }, [prefs]);

  useEffect(() => {
    const handleSync = () => setPrefs(loadFinancePrefs());
    window.addEventListener(VIEW_PREFERENCE_SYNC_EVENT, handleSync);
    return () =>
      window.removeEventListener(VIEW_PREFERENCE_SYNC_EVENT, handleSync);
  }, []);

  // Auto-log due recurring subscriptions once on mount
  const autoLogCheckedRef = useRef(false);
  useEffect(() => {
    if (autoLogCheckedRef.current) return;
    autoLogCheckedRef.current = true;
    if (workspace.financeSettings?.autoLogSubscriptionsOnLoad === false) return;
    const today = getTodayKey();
    const dueCount = subscriptions.filter(
      (s) => s.active && s.autoLog && s.nextDueDate <= today,
    ).length;
    if (dueCount > 0) {
      runDueFinanceSubscriptions();
      pushToast(
        `Auto-logged ${dueCount} due recurring ${dueCount === 1 ? "bill" : "bills"}`,
        "success",
      );
    }
  }, [
    subscriptions,
    workspace.financeSettings?.autoLogSubscriptionsOnLoad,
    runDueFinanceSubscriptions,
    pushToast,
  ]);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const accountBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const acc of accounts) {
      map.set(acc.id, computeAccountBalance(acc, transactions));
    }
    return map;
  }, [accounts, transactions]);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.archived),
    [accounts],
  );

  const visibleWalletAccounts = useMemo(() => {
    if (prefs.showAllWalletCurrencies) return activeAccounts;
    const matching = activeAccounts.filter(
      (a) => a.currency === activeCurrency,
    );
    return matching.length > 0 ? matching : activeAccounts;
  }, [activeAccounts, activeCurrency, prefs.showAllWalletCurrencies]);

  const activeCurrencyTotalBalance = useMemo(() => {
    let sum = 0;
    for (const acc of activeAccounts) {
      if (acc.currency === activeCurrency) {
        sum += accountBalances.get(acc.id) ?? acc.initialBalance;
      }
    }
    return sum;
  }, [activeAccounts, activeCurrency, accountBalances]);

  const effectivePeriodMode: FinancePeriodMode =
    prefs.subTab === "calendar" ? "month" : prefs.periodMode;

  const periodBounds = useMemo(
    () => getPeriodBounds(effectivePeriodMode, anchorDateKey),
    [effectivePeriodMode, anchorDateKey],
  );

  // Transactions in active currency & current period (used for analytics strip)
  const currencyPeriodTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (tx.currency !== activeCurrency) return false;
      if (periodBounds.startKey && tx.dateKey < periodBounds.startKey) {
        return false;
      }
      if (periodBounds.endKey && tx.dateKey > periodBounds.endKey) {
        return false;
      }
      return true;
    });
  }, [transactions, activeCurrency, periodBounds]);

  // Ledger stream transactions (period + activeCurrency + user filters)
  const filteredLedgerTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return currencyPeriodTransactions
      .filter((tx) => {
        if (typeFilter !== "all" && tx.type !== typeFilter) return false;
        if (
          accountFilter !== "all" &&
          tx.accountId !== accountFilter &&
          tx.toAccountId !== accountFilter
        ) {
          return false;
        }
        if (categoryFilter !== "all") {
          if (categoryFilter === "uncategorized") {
            if (tx.categoryId) return false;
          } else if (tx.categoryId !== categoryFilter) {
            return false;
          }
        }
        if (q) {
          const catName = tx.categoryId
            ? categoryMap.get(tx.categoryId)?.name.toLowerCase() || ""
            : "";
          const accName = accountMap.get(tx.accountId)?.name.toLowerCase() || "";
          const toAccName = tx.toAccountId
            ? accountMap.get(tx.toAccountId)?.name.toLowerCase() || ""
            : "";
          const haystack = [
            tx.merchant || "",
            tx.note || "",
            catName,
            accName,
            toAccName,
            ...(tx.tags || []),
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
        const ta = a.timeHHMM || "";
        const tb = b.timeHHMM || "";
        if (ta !== tb) return tb.localeCompare(ta);
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [
    currencyPeriodTransactions,
    typeFilter,
    accountFilter,
    categoryFilter,
    searchQuery,
    categoryMap,
    accountMap,
  ]);

  // Group filtered transactions by day
  const dailyGroups = useMemo(() => {
    const groups: {
      dateKey: string;
      items: FinanceTransaction[];
      income: number;
      expense: number;
      net: number;
    }[] = [];
    const byDay = new Map<string, FinanceTransaction[]>();

    for (const tx of filteredLedgerTransactions) {
      const list = byDay.get(tx.dateKey);
      if (list) list.push(tx);
      else byDay.set(tx.dateKey, [tx]);
    }

    for (const [dateKey, items] of byDay.entries()) {
      let income = 0;
      let expense = 0;
      for (const tx of items) {
        if (tx.type === "income") income += tx.amount;
        else if (tx.type === "expense") expense += tx.amount;
      }
      groups.push({
        dateKey,
        items,
        income,
        expense,
        net: income - expense,
      });
    }

    return groups;
  }, [filteredLedgerTransactions]);

  const dueSubscriptionsCount = useMemo(
    () =>
      subscriptions.filter((s) => s.active && s.nextDueDate <= todayKey).length,
    [subscriptions, todayKey],
  );

  const handleOpenNewDrawer = (prefill?: ParsedFinanceQuickInput) => {
    setEditingTx(null);
    setQuickPrefill(prefill ?? null);
    setDrawerOpen(true);
  };

  const handleOpenEditDrawer = (tx: FinanceTransaction) => {
    setEditingTx(tx);
    setQuickPrefill(null);
    setDrawerOpen(true);
  };

  const handleSaveTransaction = (
    draft: Omit<FinanceTransaction, "id" | "createdAt" | "updatedAt">,
    existingId?: string,
  ) => {
    if (existingId) {
      updateFinanceTransaction(existingId, draft);
      pushToast("Transaction updated", "success");
    } else {
      addFinanceTransaction(draft);
      if (draft.currency !== activeCurrency) {
        updateFinanceSettings({ activeCurrency: draft.currency });
      }
      pushToast(
        `Logged ${formatFinanceAmount(draft.amount, draft.currency)}`,
        "success",
      );
    }
  };

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    typeFilter !== "all" ||
    accountFilter !== "all" ||
    categoryFilter !== "all";

  return (
    <div className="h-full min-h-0 flex flex-col overflow-y-auto">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-display text-2xl font-bold tracking-tight">
                Finance
              </h1>
              <span
                className="text-xs font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {transactions.length}{" "}
                {transactions.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Multi-currency wallets, daily cashflow ledger &amp; recurring bills
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 3-Currency Switcher: VND / EUR / USD */}
            <div
              className="inline-flex items-center p-1 rounded-xl border shrink-0"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
              role="group"
              aria-label="Active currency switcher"
            >
              {FINANCE_CURRENCIES.map((code) => {
                const active = activeCurrency === code;
                const meta = FINANCE_CURRENCY_META[code];
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      updateFinanceSettings({ activeCurrency: code });
                      setAccountFilter("all");
                    }}
                    className="h-7 px-2.5 rounded-lg text-xs font-mono font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "transparent",
                      color: active ? "var(--accent)" : "var(--text-muted)",
                    }}
                    title={meta.name}
                  >
                    <span>{meta.symbol}</span>
                    <span>{code}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setCsvModalOpen(true)}
              className="h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-subtle)] whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenNewDrawer()}
              className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Add Entry</span>
            </button>
          </div>
        </header>

        {/* Sub-view Navigation Tabs */}
        <div
          className="flex items-center justify-between gap-3 border-b pb-2.5 overflow-x-auto"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-1.5 shrink-0">
            {(
              [
                { id: "ledger", label: "Ledger", icon: ReceiptText },
                { id: "calendar", label: "Calendar", icon: CalendarDays },
                {
                  id: "subscriptions",
                  label: "Subscriptions",
                  icon: Repeat,
                  badge: dueSubscriptionsCount,
                },
                { id: "accounts", label: "Wallets & Categories", icon: Wallet },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = prefs.subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setPrefs((p) => ({ ...p, subTab: tab.id }))
                  }
                  className="h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: active
                      ? "var(--accent-soft)"
                      : "transparent",
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {"badge" in tab && tab.badge > 0 && (
                    <span
                      className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono tabular-nums inline-flex items-center justify-center"
                      style={{
                        backgroundColor: "var(--danger)",
                        color: "#ffffff",
                      }}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div
            className="hidden sm:flex items-center gap-2 text-xs font-mono tabular-nums shrink-0"
            style={{ color: "var(--text-secondary)" }}
          >
            <span style={{ color: "var(--text-muted)" }}>
              {activeCurrency} Balance:
            </span>
            <span
              className="font-bold"
              style={{
                color:
                  activeCurrencyTotalBalance < 0
                    ? "var(--danger)"
                    : "var(--text-primary)",
              }}
            >
              {formatFinanceAmount(activeCurrencyTotalBalance, activeCurrency)}
            </span>
          </div>
        </div>

        {/* Ledger & Calendar Shared Wallets + Period + Quick-Add */}
        {(prefs.subTab === "ledger" || prefs.subTab === "calendar") && (
          <>
            {/* Wallet Balance Strip */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Wallets ({prefs.showAllWalletCurrencies ? "All Currencies" : activeCurrency})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPrefs((p) => ({
                      ...p,
                      showAllWalletCurrencies: !p.showAllWalletCurrencies,
                    }))
                  }
                  className="text-[11px] font-medium hover:underline cursor-pointer"
                  style={{ color: "var(--accent)" }}
                >
                  {prefs.showAllWalletCurrencies
                    ? `Only ${activeCurrency}`
                    : "Show all currencies"}
                </button>
              </div>

              <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1">
                {visibleWalletAccounts.map((acc) => {
                  const bal = accountBalances.get(acc.id) ?? acc.initialBalance;
                  const isFiltered = accountFilter === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        if (acc.currency !== activeCurrency) {
                          updateFinanceSettings({ activeCurrency: acc.currency });
                        }
                        setAccountFilter((prev) =>
                          prev === acc.id ? "all" : acc.id,
                        );
                      }}
                      className="min-w-[164px] px-3 py-2.5 rounded-2xl border text-left transition-colors hover:bg-[var(--bg-surface-hover)] shrink-0 cursor-pointer"
                      style={{
                        backgroundColor: isFiltered
                          ? "var(--accent-soft)"
                          : "var(--bg-surface)",
                        borderColor: isFiltered
                          ? "var(--accent)"
                          : "var(--border-subtle)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold truncate">
                          <FinanceIcon
                            name={acc.icon}
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: acc.color }}
                          />
                          <span className="truncate">{acc.name}</span>
                        </span>
                        <span
                          className="text-[10px] font-mono uppercase"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {acc.currency}
                        </span>
                      </div>
                      <div
                        className="text-sm font-bold font-mono tabular-nums mt-1"
                        style={{
                          color:
                            bal < 0 ? "var(--danger)" : "var(--text-primary)",
                        }}
                      >
                        {formatFinanceAmount(bal, acc.currency)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Period Switcher + Navigator */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              {prefs.subTab === "ledger" ? (
                <div
                  className="inline-flex items-center p-1 rounded-xl border self-start"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {PERIOD_MODES.map((m) => {
                    const active = prefs.periodMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setPrefs((p) => ({ ...p, periodMode: m.id }))
                        }
                        className="h-7 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: active
                            ? "var(--accent-soft)"
                            : "transparent",
                          color: active
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Monthly Transaction Calendar ({activeCurrency})
                </div>
              )}

              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <button
                  type="button"
                  disabled={effectivePeriodMode === "all"}
                  onClick={() =>
                    setAnchorDateKey((prev) =>
                      shiftPeriodAnchor(effectivePeriodMode, prev, -1),
                    )
                  }
                  className="h-8 w-8 rounded-xl border flex items-center justify-center hover:bg-[var(--bg-surface-subtle)] disabled:opacity-35 cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                  aria-label="Previous period"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAnchorDateKey(todayKey);
                    setSelectedCalendarDayKey(todayKey);
                  }}
                  className="h-8 px-3 rounded-xl border text-xs font-semibold hover:bg-[var(--bg-surface-subtle)] whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {periodBounds.label}
                </button>

                <button
                  type="button"
                  disabled={effectivePeriodMode === "all"}
                  onClick={() =>
                    setAnchorDateKey((prev) =>
                      shiftPeriodAnchor(effectivePeriodMode, prev, 1),
                    )
                  }
                  className="h-8 w-8 rounded-xl border flex items-center justify-center hover:bg-[var(--bg-surface-subtle)] disabled:opacity-35 cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                  aria-label="Next period"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Natural Language Quick-Add Bar */}
            <FinanceQuickAddBar
              activeCurrency={activeCurrency}
              accounts={activeAccounts}
              categories={categories}
              onSubmitTransaction={(draft) => handleSaveTransaction(draft)}
              onOpenDetailedDrawer={(prefill) => handleOpenNewDrawer(prefill)}
            />
          </>
        )}

        {/* LEDGER SUB-TAB */}
        {prefs.subTab === "ledger" && (
          <div className="space-y-4">
            <FinanceAnalyticsStrip
              currency={activeCurrency}
              periodMode={prefs.periodMode}
              transactions={currencyPeriodTransactions}
              categories={categories}
              activeCategoryFilter={categoryFilter}
              onSelectCategoryFilter={setCategoryFilter}
            />

            {/* Ledger Filter Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              <div className="relative flex-1 min-w-0">
                <Search
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search merchant, note, category, or #tag..."
                  className="w-full h-9 pl-9 pr-8 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md"
                    style={{ color: "var(--text-muted)" }}
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex items-center p-0.5 rounded-xl border"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {(["all", "expense", "income", "transfer"] as const).map(
                    (t) => {
                      const active = typeFilter === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTypeFilter(t)}
                          className="h-7 px-2.5 rounded-lg text-[11px] font-medium capitalize transition-colors cursor-pointer"
                          style={{
                            backgroundColor: active
                              ? "var(--accent-soft)"
                              : "transparent",
                            color: active
                              ? "var(--accent)"
                              : "var(--text-secondary)",
                          }}
                        >
                          {t}
                        </button>
                      );
                    },
                  )}
                </div>

                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="h-8 px-2.5 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                  aria-label="Filter by account"
                >
                  <option value="all">All Accounts</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-8 px-2.5 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                  aria-label="Filter by category"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="uncategorized">Uncategorized</option>
                </select>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setTypeFilter("all");
                      setAccountFilter("all");
                      setCategoryFilter("all");
                    }}
                    className="h-8 px-2.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <ListFilter className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Daily Grouped Stream */}
            {dailyGroups.length === 0 ? (
              <div
                className="p-10 rounded-2xl border text-center space-y-2"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <ReceiptText
                  className="w-8 h-8 mx-auto"
                  style={{ color: "var(--text-muted)" }}
                />
                <p className="text-sm font-semibold">
                  No {activeCurrency} transactions in {periodBounds.label}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Use the quick-add bar above, click Add Entry, or switch
                  currencies / periods.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {dailyGroups.map((group) => (
                  <section
                    key={group.dateKey}
                    className="rounded-2xl border overflow-hidden"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div
                      className="px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2"
                      style={{
                        backgroundColor: "var(--bg-surface-subtle)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-display font-bold">
                          {formatCompactDayHeading(group.dateKey)}
                        </span>
                        <span
                          className="text-[11px] font-mono"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {group.dateKey} · {group.items.length}{" "}
                          {group.items.length === 1 ? "item" : "items"}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                        {group.income > 0 && (
                          <span style={{ color: "var(--success)" }}>
                            +{formatFinanceAmount(group.income, activeCurrency)}
                          </span>
                        )}
                        {group.expense > 0 && (
                          <span style={{ color: "var(--danger)" }}>
                            -{formatFinanceAmount(group.expense, activeCurrency)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      className="divide-y"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      {group.items.map((tx) => {
                        const cat = tx.categoryId
                          ? categoryMap.get(tx.categoryId)
                          : null;
                        const acc = accountMap.get(tx.accountId);
                        const toAcc = tx.toAccountId
                          ? accountMap.get(tx.toAccountId)
                          : null;

                        return (
                          <button
                            key={tx.id}
                            type="button"
                            onClick={() => handleOpenEditDrawer(tx)}
                            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                            style={{ borderColor: "var(--border-subtle)" }}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                style={{
                                  backgroundColor: "var(--bg-surface-subtle)",
                                  color:
                                    tx.type === "transfer"
                                      ? "var(--accent)"
                                      : cat?.color || "var(--text-secondary)",
                                }}
                              >
                                {tx.type === "transfer" ? (
                                  <ArrowRightLeft className="w-4 h-4" />
                                ) : (
                                  <FinanceIcon
                                    name={cat?.icon || "Tag"}
                                    className="w-4 h-4"
                                  />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-sm font-semibold truncate">
                                    {tx.merchant ||
                                      (tx.type === "transfer"
                                        ? "Account Transfer"
                                        : cat?.name || tx.type)}
                                  </span>
                                  {tx.subscriptionId && (
                                    <span
                                      className="text-[10px] font-medium shrink-0"
                                      style={{ color: "var(--accent)" }}
                                    >
                                      · Recurring
                                    </span>
                                  )}
                                </div>

                                <div
                                  className="text-xs truncate flex items-center gap-1.5"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  <span>{acc?.name || "Account"}</span>
                                  {tx.type === "transfer" && toAcc && (
                                    <span>→ {toAcc.name}</span>
                                  )}
                                  {cat && <span>· {cat.name}</span>}
                                  {tx.timeHHMM && (
                                    <span className="font-mono">
                                      · {tx.timeHHMM}
                                    </span>
                                  )}
                                  {tx.note && (
                                    <span className="truncate">
                                      · {tx.note}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div
                                className="text-sm font-bold font-mono tabular-nums"
                                style={{
                                  color:
                                    tx.type === "income"
                                      ? "var(--success)"
                                      : tx.type === "expense"
                                        ? "var(--danger)"
                                        : "var(--accent)",
                                }}
                              >
                                {tx.type === "income"
                                  ? "+"
                                  : tx.type === "expense"
                                    ? "-"
                                    : ""}
                                {formatFinanceAmount(tx.amount, tx.currency)}
                              </div>
                              {tx.tags && tx.tags.length > 0 && (
                                <div
                                  className="text-[10px] font-mono truncate max-w-[120px]"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {tx.tags.map((t) => `#${t}`).join(" ")}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CALENDAR SUB-TAB */}
        {prefs.subTab === "calendar" && (
          <FinanceCalendarView
            anchorDateKey={anchorDateKey}
            selectedDayKey={selectedCalendarDayKey}
            onSelectDayKey={setSelectedCalendarDayKey}
            currency={activeCurrency}
            transactions={transactions}
            accounts={accounts}
            categories={categories}
            onEditTransaction={handleOpenEditDrawer}
          />
        )}

        {/* SUBSCRIPTIONS SUB-TAB */}
        {prefs.subTab === "subscriptions" && (
          <FinanceSubscriptionsTab
            activeCurrency={activeCurrency}
            subscriptions={subscriptions}
            accounts={accounts}
            categories={categories}
            onAddSubscription={addFinanceSubscription}
            onUpdateSubscription={updateFinanceSubscription}
            onDeleteSubscription={deleteFinanceSubscription}
            onLogNow={(id) => logFinanceSubscriptionNow(id)}
            onSkipCycle={skipFinanceSubscriptionCycle}
          />
        )}

        {/* ACCOUNTS & CATEGORIES SUB-TAB */}
        {prefs.subTab === "accounts" && (
          <FinanceAccountsCategoriesTab
            activeCurrency={activeCurrency}
            accounts={accounts}
            categories={categories}
            transactions={transactions}
            onAddAccount={addFinanceAccount}
            onUpdateAccount={updateFinanceAccount}
            onDeleteAccount={deleteFinanceAccount}
            onAddCategory={addFinanceCategory}
            onUpdateCategory={updateFinanceCategory}
            onDeleteCategory={deleteFinanceCategory}
          />
        )}
      </div>

      {/* Detailed Transaction Drawer */}
      <FinanceTransactionDrawer
        open={drawerOpen}
        editingTransaction={editingTx}
        prefill={quickPrefill}
        defaultCurrency={activeCurrency}
        accounts={accounts}
        categories={categories}
        onSave={handleSaveTransaction}
        onDelete={deleteFinanceTransaction}
        onClose={() => {
          setDrawerOpen(false);
          setEditingTx(null);
          setQuickPrefill(null);
        }}
      />

      {/* CSV Statement Import / Export Modal */}
      <FinanceCsvImportModal
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        activeCurrency={activeCurrency}
        accounts={accounts}
        categories={categories}
        transactions={transactions}
        onImport={importFinanceTransactions}
        onToast={pushToast}
      />
    </div>
  );
};
