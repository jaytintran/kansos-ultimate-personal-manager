import React, { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import {
  exportTransactionsToCsv,
  FINANCE_CURRENCIES,
  formatFinanceAmount,
  normalizeCsvDateKey,
  parseCsvNumericAmount,
  parseFinanceCsvTable,
} from "../../lib/financeUtils";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceCurrency,
  FinanceTransaction,
} from "../../types/finance";

interface FinanceCsvImportModalProps {
  open: boolean;
  onClose: () => void;
  activeCurrency: FinanceCurrency;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  transactions: FinanceTransaction[];
  onImport: (
    drafts: Omit<FinanceTransaction, "id" | "createdAt" | "updatedAt">[],
  ) => number;
  onToast: (text: string, tone?: "neutral" | "success" | "error") => void;
}

export const FinanceCsvImportModal: React.FC<FinanceCsvImportModalProps> = ({
  open,
  onClose,
  activeCurrency,
  accounts,
  categories,
  transactions,
  onImport,
  onToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rawCsv, setRawCsv] = useState("");
  const [targetAccountId, setTargetAccountId] = useState(
    () =>
      accounts.find((a) => !a.archived && a.currency === activeCurrency)?.id ||
      accounts[0]?.id ||
      "",
  );
  const [currencyOverride, setCurrencyOverride] =
    useState<FinanceCurrency>(activeCurrency);
  const [dateCol, setDateCol] = useState<number>(0);
  const [descCol, setDescCol] = useState<number>(1);
  const [amountCol, setAmountCol] = useState<number>(2);
  const [categoryCol, setCategoryCol] = useState<number>(-1);
  const [invertSign, setInvertSign] = useState(false);

  const table = useMemo(() => parseFinanceCsvTable(rawCsv), [rawCsv]);

  const handleAutoDetectColumns = (headers: string[]) => {
    const lower = headers.map((h) => h.toLowerCase());
    const findIdx = (patterns: string[]) =>
      lower.findIndex((h) => patterns.some((p) => h.includes(p)));
    const dIdx = findIdx(["date", "time", "posted"]);
    const descIdx = findIdx(["merchant", "description", "memo", "payee", "title", "detail"]);
    const amtIdx = findIdx(["amount", "total", "value", "debit", "sum"]);
    const catIdx = findIdx(["category", "group"]);

    setDateCol(dIdx >= 0 ? dIdx : 0);
    setDescCol(descIdx >= 0 ? descIdx : Math.min(1, headers.length - 1));
    setAmountCol(amtIdx >= 0 ? amtIdx : Math.min(2, headers.length - 1));
    setCategoryCol(catIdx);
  };

  const parsedDrafts = useMemo(() => {
    if (table.headers.length === 0 || !targetAccountId) return [];
    const drafts: Omit<FinanceTransaction, "id" | "createdAt" | "updatedAt">[] =
      [];
    for (const row of table.rows) {
      const dateKey = normalizeCsvDateKey(row[dateCol] || "");
      const num = parseCsvNumericAmount(row[amountCol] || "");
      if (!dateKey || num === null || num === 0) continue;

      const signed = invertSign ? -num : num;
      const type = signed > 0 ? "income" : "expense";
      const amount = Math.abs(signed);
      const merchant = (row[descCol] || "").trim() || "CSV Entry";
      const catRaw = categoryCol >= 0 ? (row[categoryCol] || "").trim().toLowerCase() : "";
      const matchedCat = catRaw
        ? categories.find(
            (c) =>
              c.kind === type &&
              c.name.toLowerCase().includes(catRaw),
          )
        : undefined;

      drafts.push({
        type,
        amount,
        currency: currencyOverride,
        accountId: targetAccountId,
        categoryId: matchedCat?.id ?? null,
        merchant,
        note: "Imported via CSV",
        dateKey,
        timeHHMM: "12:00",
      });
    }
    return drafts;
  }, [
    table,
    targetAccountId,
    dateCol,
    descCol,
    amountCol,
    categoryCol,
    invertSign,
    currencyOverride,
    categories,
  ]);

  if (!open) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setRawCsv(text);
      const parsed = parseFinanceCsvTable(text);
      if (parsed.headers.length > 0) {
        handleAutoDetectColumns(parsed.headers);
      }
    } catch {
      onToast("Could not read CSV file", "error");
    } finally {
      e.target.value = "";
    }
  };

  const handleExportCsv = () => {
    if (transactions.length === 0) {
      onToast("No transactions to export", "neutral");
      return;
    }
    const csv = exportTransactionsToCsv(transactions, accounts, categories);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kanso-finance-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onToast(`Exported ${transactions.length} transactions as CSV`, "success");
  };

  const handleConfirmImport = () => {
    if (parsedDrafts.length === 0) return;
    const count = onImport(parsedDrafts);
    onToast(
      count > 0
        ? `Imported ${count} ${count === 1 ? "transaction" : "transactions"}`
        : "All rows already exist in your ledger",
      count > 0 ? "success" : "neutral",
    );
    setRawCsv("");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-label="Import and export Finance CSV"
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative z-10 w-full sm:max-w-2xl max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border overflow-hidden flex flex-col pb-safe sm:pb-0"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-subtle)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div
          className="px-4 sm:px-5 py-3.5 border-b flex items-center justify-between shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div>
            <h2 className="font-display text-base font-bold">
              CSV Statement Import &amp; Export
            </h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Map columns from any bank or card CSV export with automatic duplicate detection
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Export row */}
          <div
            className="p-3 rounded-xl border flex items-center justify-between gap-2"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="flex items-center gap-2 text-xs">
              <FileSpreadsheet className="w-4 h-4" style={{ color: "var(--accent)" }} />
              <span className="font-medium">
                Export full ledger ({transactions.length} transactions)
              </span>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          {/* File upload & paste */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              Import CSV Statement
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void handleFileChange(e)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Choose .csv file</span>
            </button>
          </div>

          <textarea
            rows={4}
            value={rawCsv}
            onChange={(e) => {
              const val = e.target.value;
              setRawCsv(val);
              const parsed = parseFinanceCsvTable(val);
              if (parsed.headers.length > 0) {
                handleAutoDetectColumns(parsed.headers);
              }
            }}
            placeholder={"Date,Description,Amount,Category\n2025-11-20,Coffee Shop,-6.50,Food & Dining"}
            className="w-full p-3 rounded-xl border text-xs font-mono resize-y outline-none focus:border-[var(--accent)]"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          />

          {/* Mapping Controls */}
          {table.headers.length > 0 && (
            <div
              className="p-3.5 rounded-xl border space-y-3"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--text-muted)" }}>
                    Date Column
                  </label>
                  <select
                    value={dateCol}
                    onChange={(e) => setDateCol(Number(e.target.value))}
                    className="w-full h-8 px-2 rounded-lg border text-xs"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {table.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--text-muted)" }}>
                    Description
                  </label>
                  <select
                    value={descCol}
                    onChange={(e) => setDescCol(Number(e.target.value))}
                    className="w-full h-8 px-2 rounded-lg border text-xs"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {table.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--text-muted)" }}>
                    Amount
                  </label>
                  <select
                    value={amountCol}
                    onChange={(e) => setAmountCol(Number(e.target.value))}
                    className="w-full h-8 px-2 rounded-lg border text-xs"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {table.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--text-muted)" }}>
                    Category
                  </label>
                  <select
                    value={categoryCol}
                    onChange={(e) => setCategoryCol(Number(e.target.value))}
                    className="w-full h-8 px-2 rounded-lg border text-xs"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <option value={-1}>Auto / None</option>
                    {table.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                <select
                  value={targetAccountId}
                  onChange={(e) => {
                    setTargetAccountId(e.target.value);
                    const acc = accounts.find((a) => a.id === e.target.value);
                    if (acc) setCurrencyOverride(acc.currency);
                  }}
                  className="h-8 px-2 rounded-lg border text-xs"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      Account: {a.name}
                    </option>
                  ))}
                </select>

                <select
                  value={currencyOverride}
                  onChange={(e) =>
                    setCurrencyOverride(e.target.value as FinanceCurrency)
                  }
                  className="h-8 px-2 rounded-lg border text-xs font-mono"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {FINANCE_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      Currency: {c}
                    </option>
                  ))}
                </select>

                <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invertSign}
                    onChange={(e) => setInvertSign(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--accent)]"
                  />
                  <span>Flip +/- signs</span>
                </label>
              </div>

              <div className="text-xs font-semibold">
                Preview ({parsedDrafts.length} valid rows)
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
                {parsedDrafts.slice(0, 8).map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 py-0.5 border-b last:border-b-0"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {d.dateKey}
                    </span>
                    <span className="flex-1 truncate">{d.merchant}</span>
                    <span
                      className="font-mono tabular-nums font-semibold"
                      style={{
                        color:
                          d.type === "income"
                            ? "var(--success)"
                            : "var(--danger)",
                      }}
                    >
                      {d.type === "income" ? "+" : "-"}
                      {formatFinanceAmount(d.amount, d.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          className="px-4 sm:px-5 py-3 border-t flex justify-end gap-2 shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3.5 rounded-xl text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            Close
          </button>
          <button
            type="button"
            disabled={parsedDrafts.length === 0 || !targetAccountId}
            onClick={handleConfirmImport}
            className="h-9 px-4 rounded-xl text-xs font-semibold disabled:opacity-40 cursor-pointer"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            Import {parsedDrafts.length > 0 ? parsedDrafts.length : ""} Rows
          </button>
        </div>
      </div>
    </div>
  );
};
