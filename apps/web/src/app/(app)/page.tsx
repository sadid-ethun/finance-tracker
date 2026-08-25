import { redirect } from "next/navigation";

/**
 * Home is gone: its contents moved to Accounts (net worth, the tiles) and
 * Spending (the month chart), and its recent-five list was absorbed by the
 * full transaction list (IA_PLAN.md).
 *
 * The route stays as a redirect rather than being deleted. It is the manifest
 * scope root, it is what an installed home-screen icon opens if it was saved
 * before start_url changed, and it is what anyone who typed the bare domain
 * gets. Deleting it would 404 all three.
 */
export default function RootPage() {
  redirect("/transactions");
}
