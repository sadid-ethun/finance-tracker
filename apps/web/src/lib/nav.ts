import {
  ArrowLeftRight,
  ChartPie,
  CreditCard,
  Home,
  PiggyBank,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Every destination, in sidebar order. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/accounts", label: "Accounts", icon: CreditCard },
  { href: "/transactions", label: "Spending", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budget", icon: PiggyBank },
  { href: "/investments", label: "Portfolio", icon: TrendingUp },
  { href: "/cash-flow", label: "Cash Flow", icon: ChartPie },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Mobile shows four destinations plus "More"; six tabs is where a tab bar
 * starts to feel cramped (PLAN.md section 21).
 *
 * The four are the ones worth a thumb-reach on a phone. Accounts and Budget
 * sit under More: balances are already on the dashboard, and a budget is set
 * once a month rather than checked in passing.
 *
 * This array is the single source of truth — MORE_ITEMS is whatever is left,
 * so a destination can never end up in both places or in neither.
 */
export const MOBILE_TAB_HREFS = ["/", "/transactions", "/investments", "/cash-flow"];

export const MOBILE_TABS = MOBILE_TAB_HREFS.map(
  (href) => NAV_ITEMS.find((item) => item.href === href)!,
);

export const MORE_ITEMS = NAV_ITEMS.filter(
  (item) => !MOBILE_TAB_HREFS.includes(item.href),
);

/** Longest-prefix match so nested routes keep their parent tab active. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
