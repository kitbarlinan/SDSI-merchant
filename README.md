# SDSI Wellness: fulfillment & merchant portal

Demo web app for SDSI, which fulfills orders for 3 supplement merchants. Built with Next.js 15 (App Router), React 19, TypeScript and Tailwind. Data is mock data saved in the browser (no backend yet).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 and pick an account (demo sign-in, no password).

| Role | Account | What they do |
| --- | --- | --- |
| Admin | Kit | Sees everything: sales and running inventory per merchant, accounting, top-up setting |
| Cashier | Ana Cruz | Sees incoming orders, packs them, marks delivered (after collecting payment) or not delivered. Runs the walk-in POS |
| Merchant | Liza (Green Leaf), Bea (Pure Glow), Carlo (Everyday Health) | Places COP / COD orders, sees own sales and running inventory |

## How it works

- **Order flow:** Merchant places order (pending) -> Cashier packs (packed) -> Cashier marks delivered once payment is collected, or not delivered with a reason.
- **Stock:** Reserved when an order is placed. On hand drops only at delivery. Available = on hand - reserved.
- **Walk-in POS:** No customer name. Cart, payment method, cash tendered and change. A cart with several merchants' products is split into one order per merchant.
- **Accounting:** Merchant sales are pass-through, not SDSI sales. SDSI revenue = top-up % on delivered orders. Net payable to merchant = sales - top-up. The **5% top-up is a placeholder** until the real rate is agreed; each order keeps the rate it was delivered with.

## Notes

- Sign-in and permissions are demo-only. Real enforcement needs a backend (planned: Supabase Auth + row-level security).
- `lib/engine.ts` holds the business rules as pure functions; `lib/store.tsx` wraps them for React.
- "Reset demo data" (admin, sidebar) restores the seeded data.
