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
| Cashier | Ana Cruz | Packs orders, ships COD with a waybill, collects payment and marks delivered, marks RTS. Runs the walk-in POS. Receives stock and returned parcels |
| Inventory Clerk | Rey Santos | Approves (or rejects) received stock and returns. Can view orders and inventory |
| Merchant | Liza (Green Leaf), Bea (Pure Glow), Carlo (Everyday Health) | Places COP / COD orders, sees own sales and running inventory |

## How it works

- **PO ID:** every order gets a unique POID (POID-000123) that is generated once and never reused.
- **COP:** pending -> packed -> delivered (payment collected at pickup).
- **COD:** pending -> packed -> shipped (cashier enters the waybill, the merchant sees it) -> delivered once the cash is collected, or **RTS** if the parcel comes back.
- **Stock:** reserved when an order is placed (pending/packed). On hand drops when the goods leave: shipped (COD), handed over (COP) or sold at the counter. Shipped goods show as "in transit".
- **Receiving:** only the cashier records received stock, with the date received. Stock is added only after the admin or inventory clerk approves. RTS parcels are received back the same way (Inventory -> RTS).
- **Walk-in POS:** list of products, optional customer name (default "Walk-in client"), payment method, cash tendered and change. Items from several merchants are split into one order per merchant.
- **Dashboard and Accounting:** filter by merchant and by date range. Default is today.
- **Accounting:** merchant sales are pass-through, not SDSI sales. SDSI revenue = top-up % on delivered orders. Net payable to merchant = sales - top-up. The **5% top-up is a placeholder** until the real rate is agreed; each order keeps the rate it was delivered with.

## Notes

- Sign-in and permissions are demo-only. Real enforcement needs a backend (planned: Supabase Auth + row-level security).
- `lib/engine.ts` holds the business rules as pure functions; `lib/store.tsx` wraps them for React.
- "Reset demo data" (admin, sidebar) restores the seeded data.
