# Information architecture restructure

Consolidates eight destinations behind four tabs plus a More panel into five
tabs with no overflow. Written before implementation; no code has moved yet.

## The change

| # | Tab | Route | Owns |
|---|-----|-------|------|
| 1 | Spending | `/transactions` | Where money went, and every transaction |
| 2 | Budget | `/budgets` | Limits per category |
| 3 | Cash Flow | `/cash-flow` | Money in vs out, over months |
| 4 | Accounts | `/accounts` | Net worth, balances, connections |
| 5 | Portfolio | `/investments` | Holdings, allocation, performance |
| — | Settings | `/settings` | Gear in the page header, not a tab |

Money going out in the first three, what you own in the last two. Accounts
before Portfolio mirrors summary-then-detail: net worth is the total, holdings
are one component of it.

Two naming decisions follow from the grouping. Net worth sits on **Accounts**,
not Portfolio, because it includes credit card debt and checking balances — a
portfolio is your holdings, and a tab that claims to be one should not lead
with a checking balance. And the total belongs on the page that lists the
accounts it sums.

## Routing

Keep every existing path. The tab bar changes which routes it points at; it
does not rename them.

- `/` currently renders the dashboard. The dashboard dissolves (see below), so
  `/` becomes a permanent redirect to `/transactions`.
- `manifest.webmanifest` `start_url` moves to `/transactions` so a cold PWA
  launch does not eat a redirect hop. `scope` stays `/`.
- Every deep link keeps working. In particular `categoryHref()` in
  `cash-flow-view.tsx` builds `/transactions?categories=...&from=...&to=...`,
  which is untouched.

Not renaming routes is deliberate: no redirect table to maintain, no stale
home-screen bookmark, and the URLs stay readable.

## Screen composition

### 1. Spending — `/transactions`

Gains the two charts that answer the questions its list raises.

- `SpendThisMonth` — cumulative spend against the budget line *(from `/`)*.
  Carries the month's spend total, budget, and delta against the comparison
  month, so no separate summary card is needed here.
- `SpendingByCategory` — current-month breakdown *(from `/budgets`)*
- Existing filters, search, add, and the full `TransactionList`

Both charts sit in `SpendingCharts`, a client component: the current month has
to be computed in the reader's timezone, and a server component would use the
container's UTC and flip the label early at each month end.

The recent-five list on the old dashboard disappears into the full list.

**Open point — page length.** Two charts and a summary card above an infinite
list means the filter bar starts below the fold and scrolls away. Default
plan: compact chart header, filter bar sticky under it. The alternative is
collapsible charts; I would not build both.

### 2. Budget — `/budgets`

Loses `SpendingByCategory` to Spending. Everything else stays: the over-budget
card, per-category limits with progress, edit/delete/add, month switcher, copy
from last month.

No new "budget remaining" graph. That number already has two representations
on this screen — the over-budget card and the budget line on the Spending
chart. A third would be the same figure in different clothes.

### 3. Cash Flow — `/cash-flow`

Keeps what only it has: income, net, and the multi-month trend. This is the
only screen in the app where income appears at all, and it is currently
underplayed.

**Its category breakdown becomes income-only.**
`useCashFlowByCategory(kind, months)` currently toggles between income and
spending across a month range. The spending side overlaps what Spending shows
— partially, not totally, since the Spending breakdown is current-month only —
and Spending is where money going out now lives.

So: drop the `kind` toggle, hard-code the income direction, and label the
section **income by category**. That removes the duplication and surfaces the
one thing this tab uniquely owns.

The hook and its endpoint keep the `kind` parameter — only this call site stops
varying it. No API change.

`categoryHref()` still works: it now links to transactions filtered by an
income category, which is a coherent destination.

### 4. Accounts — `/accounts`

Becomes the wealth screen rather than a utility list.

- `NetWorthHero` — the figure, change, and net worth chart *(from `/`)*
- `StatTiles` — Cash / Investments / Credit *(from `/`)*
- Existing `AccountList`, grouped by type
- `Connections` — the whole component, moved out of Settings: the linked
  institutions, per-item sync, re-link, remove, and the connect button.
  Managing a bank connection is an account action, not a setting.
- `/accounts/[id]` unchanged, now with an obvious parent tab

The "Connect your first account" empty state moves here from the dashboard,
which puts the connect CTA on the same screen as the connection list.

`connections.tsx` also renders sync-run history from `useSyncRuns()`. That
moves with it rather than staying behind under Data — the history is *about*
your connections, and one concern should not have two homes. That is the same
reasoning that moved the component in the first place.

**Settings loses a tab.** It is currently `Connections | Security | Categories
| Rules | Data`. Dropping Connections leaves four, which is still a reasonable
tabbed screen and does not need restructuring.

### 5. Portfolio — `/investments`

Unchanged in content: performance chart, allocation, holdings, cost-basis
override. Only its position and the removal of net worth from its
neighbourhood change.

## Navigation chrome

**`lib/nav.ts`** — reorder `NAV_ITEMS`; `MOBILE_TAB_HREFS` becomes the five
tab routes; delete `MORE_ITEMS` and its comment block. Settings stays in
`NAV_ITEMS` for the desktop sidebar but is no longer a mobile tab, so the
"whatever is left" derivation needs an explicit opt-out instead.

**`bottom-tabs.tsx`** — delete the More button, the panel, the scrim, and the
`panel`/`moreOpen` state machine. This removes the component that produced
three bugs in this session: two elements sharing a `layoutId`, the panel
reopening on return to its route, and it not dismissing on tab navigation.
Five tabs, one capsule indicator, no local state.

**`page-header.tsx`** — a settings gear, top right, on every screen. Put it in
`PageHeader` itself rather than passing it per page, so it cannot drift. The
existing `action` prop stays for page-specific extras — and it *is* used:
Spending passes `AddTransactionButton`, so that header carries the Add pill
and the gear side by side.

**Refresh** — the icon in `NetWorthHero` and the page-level sync on
`investments-view` give way to pull-to-refresh. Restore
`components/shared/pull-to-refresh.tsx` from `88c4a04` and mount it around
`<main>` in `(app)/layout.tsx`. Not the route progress bar from that same
commit. Per-item sync buttons in `settings/connections.tsx` stay — those are
per-connection actions, not a page refresh.

## Risks

**Five tabs at 375px — already answered.** The bar renders four tabs plus the
More button as five `flex-1` columns today, so the new layout is the same
geometry with More replaced by a real tab. At 375px that is 343px of bar
across five columns, about 68px each, against a longest label of "Cash Flow"
at `text-[10px] font-medium` — roughly 50px. It already fits, because it
already does.

**Gear plus page actions — real, not hypothetical.** I wrote earlier that no
page passed `action`; Spending does, and has all along. Its header now holds
the title, the Add pill, and the gear. Nothing overflows at 375px, but it is
the one header worth looking at on a narrow screen, and it is the busiest
tab.

**No visible refresh affordance on desktop**, where there is no gesture.
Browser reload covers it. If that grates, a "Refresh data" item on the
settings screen is the escape hatch.

**Spending becomes the longest screen in the app.** Pull-to-refresh only fires
at scroll top, so from deep in the transaction list there is no way to
refresh. A consequence of the shape of that tab, not a defect.

## Unrelated fix to fold in

`public/manifest.webmanifest` still carries `#020810` for both
`background_color` and `theme_color` — the pre-overhaul palette. `layout.tsx`
was updated to `#0f1011` during the design work and the manifest was missed,
so the PWA splash screen flashes the old blue-black. Fix it while editing the
manifest for `start_url`.

## Phases

1. **Chrome.** Five tabs, gear in the header, delete More, manifest colors.
   No content moves, so every screen still renders exactly what it renders
   today — which makes this phase safe to ship on its own and easy to eyeball
   on a phone. *(Done.)*

   The `/` redirect and `start_url` move to phase 2, not here. Redirecting `/`
   before the dashboard is dissolved would strand net worth, the stat tiles,
   and spend-this-month with nowhere to land — unreachable for a whole deploy.
   So Home keeps its route and its sidebar entry through phase 1; it simply
   stops being a mobile tab. That is why `NON_TAB_HREFS` lists `/` alongside
   `/settings`.
2. **Dissolve the dashboard.** *(Done.)* `NetWorthHero` and `StatTiles` to
   Accounts; `SpendThisMonth` and `SpendingByCategory` to Spending;
   `MonthCard` to Cash Flow, not Spending; `CashFlowChart` deleted rather than
   moved; `dashboard-view.tsx` deleted. Then the `/` redirect, `start_url`,
   and dropping Home from `NAV_ITEMS` and `NON_TAB_HREFS`.

   Three things the code disagreed with the plan about, all found by reading
   it rather than by the checks:

   * **`CashFlowChart` was a lesser copy of Cash Flow's `Trend`** — same six
     months, same `spendingDown` mirroring, same `symmetricTicks`, same zero
     `ReferenceLine`. Trend is a `ComposedChart` with a net line over the
     bars; this was a plain `BarChart`. Deleted, not moved.
   * **`AccountList` already rendered its own net-worth card** with an
     assets/liabilities pair. Dropping `NetWorthHero` and `StatTiles` above it
     unchanged would have put net worth on that page twice and
     assets/liabilities twice. Its card is gone; the hero and the tiles are
     the single copy.
   * **`MonthCard` carries income**, so it does not belong on Spending, and
     `SpendThisMonth` already shows the month's spend total against budget —
     so Spending loses nothing. It went to Cash Flow, above the range switcher
     since it is always the current month.
3. **Move connections, trim Cash Flow.** `Connections` from Settings to
   Accounts; the Cash Flow breakdown to income-only. Both are self-contained
   and independent of each other.
4. **Gesture and polish.** Pull-to-refresh restore, the Spending sticky filter
   bar, empty states.

## Out of scope

No API changes. No new endpoints, no query changes, no schema changes. Every
hook named here already exists and returns what the new placement needs.
