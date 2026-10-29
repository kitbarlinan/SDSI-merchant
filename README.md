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

## Costing, For Approval and CF

- **Accounting → Costing (admin only).** Per product + quantity: Net SRP → mark-up (50%) → basis in HKD (FX 8.1432) → final basis (+5 HKD per qty) → pickup price (set by hand) → SF 34 → collection fee = (pickup + SF) × 2.5%, rounded to whole HKD, minimum 5 → Net COD. Net remittance (PHP) = Net SRP. Saving needs a review screen; every change is written to the change log.
- **For Approval** (Admin, Inventory Clerk): approve or reject received stock and RTS receipts. Clerk lands here after sign-in.
- **CF** (HKD) is shown under the total on COD orders and in the merchant New Order form. It is a snapshot taken when the order is placed, and only when every line matches a priced package.

## Costing workflow (draft → approved → live)

- A price you type is saved as a **Draft**. **Approve** (red) then **Go live** (blue). Each step asks for a confirmation and is logged.
- Orders, the New Order form and the POS use only the **live** version (frozen pickup, SF, CF, net COD). Editing a live row makes a new draft; the old live version stays in use until the new one goes live.
- **New SKU**: SKU code, name, merchant, SRP, package quantities. The code must be unique (case-insensitive) and is never reused, even after disabling. A new SKU can receive stock but is not on sale until one package is live.
- **Disable SKU** blocks new orders and sales. Open orders are untouched. Packages that have been live cannot be deleted, only the SKU disabled.
- COD orders store **SF, CF and net COD (HKD)** from the live costing when placed.
- **SF is charged once per POID.** **CF is worked out on the order's total collection**: (sum of pickup prices + SF) × CF rate, rounded to a whole HKD, minimum 5. Net COD = pickup total + SF + CF.
- **Top-up (estimate).** SDSI's top-up is the costing mark-up on Net SRP (50%: 1,485 − 990 = 495 on a 990 SRP), in pesos, for every delivered order. It comes from Costing settings; there is no separate top-up rate. What SDSI remits to the merchant is the Net SRP, with nothing deducted. The real top-up (pickup / COD price in HKD, converted, less the remittance) is still to do.
- **Orders and POS now run on the live costing, in HKD.** The product list shows each live package price (×1, ×2 …); a quantity with no live package is rejected ("No price for 9. Packages: 1, 2, 3, 4, 5."). COD collects **pickup total + SF (once) + CF**; pickup (COP) and counter sales collect the pickup total. The peso Net SRP stays on every order as the amount remitted to the merchant, and drives the top-up estimate.

## SKU-per-row costing and the price basis

- **One costing row per SKU.** Solo (SKU-001) and twin pack (SKU-002) are separate SKUs with their own code, SRP and pickup price. "Qty (pcs)" is only the number of pieces inside the SKU and drives the +5 HKD SF per piece. A line on an order is priced as quantity × the SKU's live pickup price.
- **Accounting.** Customer price basis = SRP × (1 + mark-up) (990 → 1,485). SDSI top-up (estimate) = the difference (495). Net payable to the merchant = basis − top-up = the SRP (990).
