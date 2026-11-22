export type FinanceCurrency = "VND" | "EUR" | "USD";

export type FinanceAccountType =
  | "bank"
  | "card"
  | "cash"
  | "savings"
  | "wallet";

export interface FinanceAccount {
  id: string;
  name: string;
  type: FinanceAccountType;
  currency: FinanceCurrency;
  initialBalance: number;
  color: string;
  icon: string;
  archived?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type FinanceCategoryKind = "expense" | "income";

export interface FinanceCategory {
  id: string;
  name: string;
  kind: FinanceCategoryKind;
  icon: string;
  color: string;
  createdAt: string;
  updatedAt?: string;
}

export type FinanceTransactionType = "expense" | "income" | "transfer";

export interface FinanceTransaction {
  id: string;
  type: FinanceTransactionType;
  amount: number;
  currency: FinanceCurrency;
  accountId: string;
  toAccountId?: string | null;
  toAmount?: number | null;
  categoryId?: string | null;
  merchant?: string;
  note?: string;
  dateKey: string; // YYYY-MM-DD
  timeHHMM?: string | null; // HH:mm
  tags?: string[];
  subscriptionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FinanceBillingCycle =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export interface FinanceSubscription {
  id: string;
  name: string;
  amount: number;
  currency: FinanceCurrency;
  accountId: string;
  categoryId: string;
  billingCycle: FinanceBillingCycle;
  nextDueDate: string; // YYYY-MM-DD
  autoLog: boolean;
  active: boolean;
  lastLoggedDate?: string | null;
  notes?: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceSettings {
  activeCurrency: FinanceCurrency;
  autoLogSubscriptionsOnLoad?: boolean;
}
