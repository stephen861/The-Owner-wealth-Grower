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
- **Dashboard** — portfolio snapshot: timeshare count, available points, annual
  allotment, outstanding fees, exchange deposits, travel rewards balance, upcoming
  trips, fees coming due, expiring deposits, and **membership renewals & expiring
  rewards** in the next 120 days.

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
| `Timeshare`          | An owned contract/membership (parent of everything else)    |
| `PointsAccount`      | Point balance for one use year on a timeshare               |
| `Benefit`            | A membership perk/tier benefit with optional usage allowance|
| `ExchangeMembership` | An exchange network or travel club (RCI, Interval, Costco…) |
| `ExchangeDeposit`    | A week/points block deposited into an exchange for trading  |
| `MembershipPerk`     | A dollar-value reward/credit/discount on a membership       |
| `Reservation`        | A booked or planned stay                                    |
| `Fee`                | A financial obligation (maintenance, assessment, dues, loan…)|

The database file (`prisma/dev.db`) is git-ignored — your data stays local.

## Tech notes

- Mutations use Next.js **Server Actions** (no separate API layer to maintain).
- Pages are server components reading directly from Prisma.
- Change `DATABASE_URL` in `.env` to point the SQLite file elsewhere, or swap the
  Prisma `datasource` provider to Postgres/MySQL to host it.

---

# 🏢 FGW Leasing Agent — 24/7 affordable-housing leasing

An AI leasing agent for **FGW Property Management** that answers affordable-housing
prospects around the clock by **SMS (Twilio)** and **web chat**, pre-screens income
eligibility, books tours, manages waitlists, and hands off to staff.

## What it does

| Capability | How |
|---|---|
| Answers 24/7 | Claude (`claude-opus-5-5`) with tools over your live property/unit data |
| Income pre-screen | Deterministic engine (`src/lib/leasing/eligibility.ts`) checks AMI limits by household size, rent-to-income minimum (waived for voucher holders), and occupancy. The AI reports results; it never decides eligibility itself. |
| Tours | Books tours (Mon–Sat 9:00–17:30, ≥1h notice, no double-booking) |
| Waitlist / apply | Adds to waitlist or sends the property's application link |
| Staff handoff | Escalates accommodation requests, complaints, legal, upset prospects, or "talk to a person". Staff reply from the inbox; a staff reply pauses the AI until handed back. |
| Fair housing guardrails | System prompt forbids protected-class questions and steering; accommodation requests always go to a human |
| Safety | Emergencies (gas leak, fire, flood…) skip the AI and get an instant 911 / office-line reply + URGENT flag. STOP/START opt-outs are honored. |
| Bilingual | Replies in the prospect's language (Spanish built into the greeting) |
| Resilient | No API key or an API error → holding reply + automatic staff flag, so no lead is dropped |

## Pages

- `/leasing` — staff inbox: KPIs (new leads, needs-staff, after-hours messages, tours), pipeline, filters
- `/leasing/[id]` — conversation thread, profile, tours, staff reply, AI take-over / hand-back
- `/leasing/properties` — properties, units, rents, AMI set-asides, income-limit tables (paste 1–8 person rows)
- `/chat` — public prospect web chat (link it from your website or embed in an iframe)

## Go-live checklist

1. **Data**: in `/leasing/properties`, enter real properties, units, rents, and your
   current HUD / state income limits. *Seed limits are samples — replace them.*
2. **AI**: set `ANTHROPIC_API_KEY` (put secrets in `.env.local`, which is git-ignored).
3. **Timezone**: run the server with `TZ` set to the properties' zone (e.g. `TZ=America/New_York`) so tour hours are correct.
4. **SMS**: in Twilio, set your number's *A message comes in* webhook to
   `POST https://<your-domain>/api/leasing/sms`. Set `TWILIO_AUTH_TOKEN` and
   `PUBLIC_BASE_URL` (signatures are verified; unsigned requests are rejected in production).
   Also set `TWILIO_ACCOUNT_SID` + `TWILIO_FROM_NUMBER` so replies are sent asynchronously
   (avoids Twilio's 15-second webhook timeout) and staff can reply by SMS.
   Register for A2P 10DLC before sending at volume.
5. **Office line**: set `FGW_OFFICE_PHONE` — it's what prospects are told to call on handoffs and emergencies.
6. **Review**: have your compliance lead review the system prompt in `src/lib/leasing/agent.ts` against your fair-housing policy and local occupancy standards (`eligibility.ts` uses 2-per-bedroom + 1).

Notes: requests use server-side refusal fallbacks (`fallbacks: "default"`) so a declined
request is retried on a fallback model, and `effort: "low"` for fast, low-cost chat replies.
