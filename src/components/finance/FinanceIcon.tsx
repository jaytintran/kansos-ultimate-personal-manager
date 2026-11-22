import React from "react";
import {
  Banknote,
  Briefcase,
  Car,
  Coffee,
  CreditCard,
  Film,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  PiggyBank,
  Plane,
  Repeat,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingUp,
  Utensils,
  Wallet,
  Zap,
} from "lucide-react";

export const FINANCE_ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  Utensils,
  ShoppingBag,
  Car,
  Home,
  Repeat,
  HeartPulse,
  Sparkles,
  Briefcase,
  Laptop,
  TrendingUp,
  Coffee,
  Plane,
  Gamepad2,
  GraduationCap,
  Gift,
  Film,
  Zap,
  Landmark,
  CreditCard,
  Banknote,
  Wallet,
  PiggyBank,
  Tag,
};

export const FINANCE_CATEGORY_ICON_OPTIONS = [
  "Utensils",
  "Coffee",
  "ShoppingBag",
  "Car",
  "Plane",
  "Home",
  "Zap",
  "Repeat",
  "HeartPulse",
  "Sparkles",
  "Film",
  "Gamepad2",
  "GraduationCap",
  "Gift",
  "Briefcase",
  "Laptop",
  "TrendingUp",
  "PiggyBank",
  "Tag",
] as const;

export const FINANCE_ACCOUNT_ICON_OPTIONS = [
  "Landmark",
  "CreditCard",
  "Banknote",
  "Wallet",
  "PiggyBank",
] as const;

export const FINANCE_COLOR_SWATCHES = [
  "#b45309",
  "#047857",
  "#3b6998",
  "#4f46e5",
  "#be185d",
  "#0f766e",
  "#7c3aed",
  "#c2410c",
  "#1d4ed8",
  "#475569",
] as const;

export const FinanceIcon: React.FC<{
  name?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ name, className = "w-4 h-4", style }) => {
  const Icon = (name && FINANCE_ICON_MAP[name]) || Tag;
  return <Icon className={className} style={style} />;
};
