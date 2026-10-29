# Merchant Manager

Next.js (App Router) + React + TypeScript + Tailwind CSS. Three modules in a dashboard layout:

| Route | Module | What it does |
| --- | --- | --- |
| `/sales` | Sales Input | Form with real-time validation, auto-computed total, confirmation banner, recent sales list |
| `/inventory` | Inventory | Stock table (SKU, unit cost, unit price, margin), low-stock alerts, search, restock button |
| `/reports` | Accounting & Reports | Revenue / Estimated COGS / Net Profit, sales by item, sales by payment method, searchable ledger |

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
app/
  layout.tsx            Root layout: MerchantProvider + AppShell
  page.tsx              Redirects to /sales
  sales/page.tsx
  inventory/page.tsx
  reports/page.tsx
components/
  layout/               AppShell (sidebar / mobile tabs), PageHeader
  sales/                SalesForm, RecentSales
  inventory/            InventoryView, StockBadge
  reports/              ReportsView
  ui/                   Badge, Field, Icon, StatCard
lib/
  types.ts              Domain types + PAYMENT_METHODS
  mock-data.ts          3 inventory items + 3 sales
  store.tsx             React context store (addSale deducts stock), localStorage persistence
  validation.ts         Pure sale-form validation
  reports.ts            Pure selectors: summarize, breakdownByItem, breakdownByPayment
  inventory.ts          Stock status rules
  format.ts             PHP currency / date helpers
```

## Design notes

- **Single source of truth.** `store.tsx` holds `items` and `sales`. `addSale` records the sale and deducts stock in one state update, so the Inventory and Reports modules always agree.
- **Derived, not duplicated.** Revenue, COGS, profit and both breakdowns are computed from `sales` in `lib/reports.ts`. Nothing is stored twice.
- **COGS accuracy.** Each sale keeps a snapshot of `unitCost` at the time of sale, so later cost changes do not rewrite history.
- **Net profit** here is revenue minus COGS (gross profit). Operating expenses are not tracked yet.
- **Persistence.** Data is saved to `localStorage` (key `merchant-app:v1`). Use "Reset demo data" in the sidebar to restore the mock entries.

## Moving to a real backend

Replace the bodies of `addSale`, `restock` and the initial load in `lib/store.tsx` with calls to Route Handlers or Server Actions backed by a database (for example Supabase/Postgres). The components only depend on the `useMerchant()` interface, so they should not need to change. For multi-user use, make the stock deduction and sale insert a single database transaction.
