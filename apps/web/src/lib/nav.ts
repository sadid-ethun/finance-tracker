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
  { href: "/transactions", label: "Spending", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budget", icon: PiggyBank },
  { href: "/cash-flow", label: "Cash Flow", icon: ChartPie },
  { href: "/accounts", label: "Accounts", icon: CreditCard },
  { href: "/investments", label: "Portfolio", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * The five mobile tabs, in bar order (IA_PLAN.md).
 *
 * Money going out in the first three, what you own in the last two. Accounts
 * precedes Portfolio because net worth is the total and holdings are one
 * component of it — summary before detail.
 *
 * Five is the whole set: there is no More panel, so every destination reachable
 * on a phone is one tap away. Two destinations are deliberately not tabs:
 * Settings lives behind the gear in PageHeader, and Home is being dissolved
 * into Accounts and Spending (IA_PLAN.md phase 2), after which `/` redirects.
 */
export const MOBILE_TAB_HREFS = [
  "/transactions",
  "/budgets",
  "/cash-flow",
  "/accounts",
  "/investments",
];

export const MOBILE_TABS = MOBILE_TAB_HREFS.map(
  (href) => NAV_ITEMS.find((item) => item.href === href)!,
);

/**
 * Destinations reachable on desktop but not from the mobile tab bar.
 *
 * Listed explicitly rather than derived as "whatever is left over". The old
 * derivation fed a More panel, so anything omitted from the tab list still had
 * somewhere to go; now there is no overflow, and a destination missing from
 * both lists would simply vanish on mobile. Naming them makes that a
 * deliberate choice rather than an accident of set arithmetic.
 */
export const NON_TAB_HREFS = ["/", "/settings"];

if (process.env.NODE_ENV !== "production") {
  const covered = new Set([...MOBILE_TAB_HREFS, ...NON_TAB_HREFS]);
  const stranded = NAV_ITEMS.filter((item) => !covered.has(item.href));
  if (stranded.length > 0) {
    throw new Error(
      `nav: ${stranded.map((i) => i.href).join(", ")} is in NAV_ITEMS but ` +
        `neither a mobile tab nor listed in NON_TAB_HREFS, so it would be ` +
        `unreachable on mobile. Add it to one of them.`,
    );
  }
}

/** Longest-prefix match so nested routes keep their parent tab active. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
