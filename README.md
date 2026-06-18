# 🌴 Owner Wealth Grower — Timeshare Travel CRM

A self-hosted CRM for managing your **timeshares** and **timeshare benefits**. Track
ownership contracts, points balances by use year, membership perks, reservations/trips,
and the fees & finances that come with ownership — all in one place.

Built with **Next.js (App Router) + TypeScript + Prisma + SQLite**. No external accounts
required; your data lives in a local SQLite file.

## Features

- **Timeshares** — every contract/membership you own: brand, resort, ownership type
  (points / deeded week / fractional / RTU), contract & member numbers, annual point
  allotment, purchase info, and notes.
- **Points & Benefits** — point balances per use year (allotted, used, banked, borrowed,
  available, expiration) plus membership tier perks with usage allowances you can redeem.
- **Reservations** — upcoming and past stays with nights, points/cash spent, guests,
  confirmation numbers, guest certificates, and status tracking.
- **Fees & Finances** — maintenance fees, special assessments, club dues, loans and
  taxes, with due dates, overdue flags, and paid/unpaid tracking.
- **Dashboard** — portfolio snapshot: timeshare count, available points, annual
  allotment, outstanding fees, upcoming trips, and fees coming due.

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

| Model           | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `Timeshare`     | An owned contract/membership (parent of everything else)         |
| `PointsAccount` | Point balance for one use year on a timeshare                    |
| `Benefit`       | A membership perk/tier benefit with optional usage allowance     |
| `Reservation`   | A booked or planned stay                                         |
| `Fee`           | A financial obligation (maintenance, assessment, dues, loan…)    |

The database file (`prisma/dev.db`) is git-ignored — your data stays local.

## Tech notes

- Mutations use Next.js **Server Actions** (no separate API layer to maintain).
- Pages are server components reading directly from Prisma.
- Change `DATABASE_URL` in `.env` to point the SQLite file elsewhere, or swap the
  Prisma `datasource` provider to Postgres/MySQL to host it.
