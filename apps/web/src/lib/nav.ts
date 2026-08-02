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
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budget", icon: PiggyBank },
  { href: "/investments", label: "Investments", icon: TrendingUp },
  { href: "/cash-flow", label: "Cash Flow", icon: ChartPie },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Mobile shows four destinations plus "More"; six tabs is where a tab bar
 * starts to feel cramped (PLAN.md section 21).
 */
export const MOBILE_TAB_HREFS = ["/", "/accounts", "/transactions", "/budgets"];

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
