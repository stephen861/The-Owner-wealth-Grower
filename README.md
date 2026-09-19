# 🌴 Owner Wealth Grower — Operations CRM

A self-hosted CRM for the whole operation: the **rental portfolio** you own and manage
(a Rent Manager replacement), the **clients and deals** that feed it, and the
**timeshare benefits** that round it out.

Built with **Next.js (App Router) + TypeScript + Prisma + SQLite**. No external accounts
required; your data lives in a local SQLite file.

## Features

### Property management (the Rent Manager replacement)

- **Properties & units** — buildings you own or manage, with owner, management-fee
  rate, purchase/market value, mortgage balance and per-unit beds/baths/sqft/market
  rent. Occupancy and equity roll up across the portfolio.
- **Rent roll** — every lease with term, rent, due day, deposit held, late-fee terms
  and live balance. Delinquency is ranked by how far behind each tenant is.
- **Month-end run** — one button posts the month's rent to every active lease, a
  second assesses late fees on past-grace balances. Both are **idempotent**: a lease
  already billed for the period is skipped, so re-running never double-bills.
- **Tenant ledger** — charges and payments interleaved into one running-balance
  statement per lease, covering rent, late fees, utility rebills and repair charges.
- **Maintenance** — work orders by property/unit with priority, vendor assignment and
  age. Closing one books the cost as a property expense and, when flagged billable,
  rebills the tenant automatically.
- **Vendors** — your trade bench with rates, open job counts, spend to date, and W-9 /
  insurance compliance flags.
- **Owner statements** — per-owner monthly statement: rent collected, operating
  expenses, your management fee, and net distributable, with an expense breakdown by
  category.

### Clients & pipeline

- **Contacts** — one people table for tenants, owners, leads, clients and partners,
  with source, status, tags and next follow-up date.
- **Pipeline** — deals by stage with value, commission rate and probability, plus a
  weighted commission forecast and win rate.
- **Activities** — a follow-up queue split into overdue / due today / upcoming, with
  a per-contact timeline of every touchpoint.

### Timeshare portfolio

- **Timeshares** — every contract/membership you own: brand, resort, ownership type
  (points / deeded week / fractional / RTU), contract & member numbers, annual point
  allotment, purchase info, and notes.
- **Points & Benefits** — point balances per use year (allotted, used, banked, borrowed,
  available, expiration) plus membership tier perks with usage allowances you can redeem.
- **Exchanges & Memberships** — exchange networks and travel clubs (RCI, Interval
  International, Westgate Cruise & Travel, Costco Travel, Sam's Club Travel, DAE, SFX):
  - **Deposits** — weeks/points deposited for trading, with trading power, points value,
    and expiry (use-it-or-lose-it flags).
  - **Rewards & credits** — dollar-value rewards/credits/discounts (Costco Executive 2%
    reward, Sam's Cash, travel credits) with used/remaining balances and an inline
    "Use" action to record redemptions.
- **Reservations** — upcoming and past stays with nights, points/cash spent, guests,
  confirmation numbers, guest certificates, and status tracking.
- **Fees & Finances** — maintenance fees, special assessments, club dues, loans and
  taxes, with due dates, overdue flags, and paid/unpaid tracking.
### Dashboard

Three stacked sections — **Property management** (occupancy, scheduled rent, collection
rate, delinquency, open work orders, plus who owes you money and which work orders need
attention), **Revenue engine** (pipeline, weighted commission forecast, commission won,
follow-ups due, deals closing soon), and **Portfolio** (points, fees, exchange deposits,
membership renewals and expiring rewards).

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Generate the Prisma client, create the SQLite DB, and load sample data
npm run setup

# 3. Start the dev server
npm run dev
```

Then open http://localhost:3000.

To start from an empty database instead of sample data, run
`npx prisma generate && npx prisma db push` (skip the seed).

## Useful scripts

| Script             | What it does                                          |
| ------------------ | ----------------------------------------------------- |
| `npm run dev`      | Start the Next.js dev server                          |
| `npm run build`    | Generate Prisma client + production build             |
| `npm run setup`    | Generate client, push schema, and seed sample data    |
| `npm run db:push`  | Apply the Prisma schema to the database               |
| `npm run db:seed`  | Load sample data                                      |
| `npm run db:reset` | Wipe and reseed the database                          |
| `npm run db:studio`| Open Prisma Studio to browse/edit data directly       |

## Data model

### Property management

| Model       | Purpose                                                            |
| ----------- | ------------------------------------------------------------------ |
| `Property`  | A building you own or manage; owner + management-fee rate          |
| `Unit`      | A rentable space inside a property                                 |
| `Lease`     | A tenancy: one unit, one tenant, a term and rent terms             |
| `Charge`    | Money owed on a lease (rent, late fee, utility, repair)            |
| `Payment`   | Money received against a lease                                     |
| `Vendor`    | A trade you dispatch work to                                       |
| `WorkOrder` | A maintenance request against a property or unit                   |
| `Expense`   | An operating cost against a property; feeds the owner statement    |

### Clients

| Model      | Purpose                                                             |
| ---------- | ------------------------------------------------------------------- |
| `Contact`  | A person: tenant, owner, lead, client, partner or guest             |
| `Deal`     | A revenue opportunity moving through the pipeline                   |
| `Activity` | A logged touchpoint or an open follow-up task                       |

### Timeshare portfolio

| Model           | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `Timeshare`          | An owned contract/membership                                |
| `PointsAccount`      | Point balance for one use year on a timeshare               |
| `Benefit`            | A membership perk/tier benefit with optional usage allowance|
| `ExchangeMembership` | An exchange network or travel club (RCI, Interval, Costco…) |
| `ExchangeDeposit`    | A week/points block deposited into an exchange for trading  |
| `MembershipPerk`     | A dollar-value reward/credit/discount on a membership       |
| `Reservation`        | A booked or planned stay                                    |
| `Fee`                | A financial obligation (maintenance, assessment, dues, loan…)|

The database file (`prisma/dev.db`) is git-ignored — your data stays local.

## Not yet covered

Rent Manager also does these; this app does not yet:

- Full double-entry general ledger, bank reconciliation and 1099 filing
- Tenant/owner self-service portals and online rent payment processing
- Built-in e-signature for leases, and document storage
- Automated tenant SMS/email reminders (the follow-up queue is manual today)
- Multi-user accounts and permissions — this is a single-operator app

## Tech notes

- Mutations use Next.js **Server Actions** (no separate API layer to maintain).
- Pages are server components reading directly from Prisma.
- Change `DATABASE_URL` in `.env` to point the SQLite file elsewhere, or swap the
  Prisma `datasource` provider to Postgres/MySQL to host it.
