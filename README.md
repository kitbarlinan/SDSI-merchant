# SDSI Wellness

Supplements sales and inventory app. Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS. No chart library: all charts are plain SVG.

| Route | Module | What it does |
| --- | --- | --- |
| `/dashboard` | Dashboard | KPI cards with change vs. previous period, revenue and profit trend (hover for daily figures), sales by category, top products, channels, payment methods, inventory alerts, recent orders. Period switch: 7 / 30 / 90 days / all time |
| `/sales` | Sales Input | Form with real-time validation, auto total, sales channel, confirmation banner, recent sales |
| `/inventory` | Inventory | SKU, category, stock, unit cost / price, margin, expiry date, days of cover, low-stock status, search and filters, restock button |
| `/reports` | Accounting & Reports | Revenue, estimated COGS, net profit (est.), sales by product with margin, by category / channel / payment method, top customers, searchable ledger, CSV export |

## Setup

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

Requires Node 18.18+ (Node 20+ recommended).

## Structure

```
app/                     Routes: dashboard, sales, inventory, reports
components/
  charts/                TrendChart, DonutChart, BarList (SVG, no dependencies)
  dashboard/             DashboardView, AlertsPanel
  inventory/             InventoryView, StockBadge, ExpiryBadge
  layout/                AppShell (sidebar / mobile tabs), PageHeader
  reports/               ReportsView
  sales/                 SalesForm, RecentSales
  ui/                    Badge, Card, Field, Icon, PeriodTabs, StatCard
lib/
  brand.ts               App name, supplier lead time (90 days), expiry warning window (90 days)
  types.ts               Domain types, payment methods, sales channels, categories
  mock-data.ts           10 supplements + ~200 generated sales over 75 days (deterministic)
  store.tsx              React context store (addSale deducts stock), localStorage persistence
  reports.ts             Pure selectors: summarize, groupSales, buildTrend, breakdownByItem
  inventory.ts           Stock status, expiry status, days of cover
  period.ts              Period ranges and date math (timezone-safe)
  validation.ts          Pure sale-form validation
  theme.ts               Chart colors
  format.ts              PHP currency / date helpers
```

## Rename the app

Edit `lib/brand.ts`. The name and tagline appear in the sidebar, page title and README only from there.

## Design notes

- **Single source of truth.** `store.tsx` holds `items` and `sales`. `addSale` records the sale and deducts stock in one update, so Dashboard, Inventory and Reports always agree.
- **Derived, not duplicated.** Every figure is computed from `sales` in `lib/reports.ts`.
- **COGS accuracy.** Each sale keeps a snapshot of `unitCost` and `category` at the time of sale, so later changes do not rewrite history.
- **Net profit** is revenue minus COGS (gross profit). Operating expenses are not tracked yet.
- **Expiry.** Expired products cannot be sold. Products expiring within 90 days are flagged.
- **Days of cover** = stock / average daily units sold over the last 30 days. Under the 90-day supplier lead time means it is time to reorder.
- **Persistence.** Data is saved to `localStorage` (key `sdsi-wellness:v2`). "Reset demo data" restores the generated demo set.
- **Demo date.** The demo sales history ends on 2026-10-29. Period filters count back from today's real date, so after about 90 days the demo data ages out of the shorter periods. Use "All time", or reset after connecting a real database.

## Moving to a real backend

Replace the bodies of `addSale`, `restock` and the initial load in `lib/store.tsx` with calls to Route Handlers or Server Actions backed by a database (for example Supabase/Postgres). Components only depend on the `useMerchant()` interface. For multi-user use, make the stock deduction and the sale insert a single database transaction.
