# FGW Leasing Agent — Go-Live Checklist

The agent stays in **dry-run mode** until `LEASING_LIVE=true`. In dry run it
answers web chat and generates SMS replies, but no text reaches anyone except
the numbers in `LEASING_TEST_NUMBERS`. Held replies show in the inbox as
"Not sent — dry run".

`npm run leasing:check` tells you exactly what's left. Go live only when it says **READY**.

## What FGW needs to provide

### 1. Listing data (start now: one spreadsheet per tab)
Fill in the three templates in `docs/leasing/templates/` (Excel/Google Sheets → export CSV):

| File | One row per | Must include |
|---|---|---|
| `properties.csv` | community | name, address, **timezone**, program (LIHTC / SECTION_8 / PBV / HOME / MIXED / MARKET), voucher acceptance, office phone + hours, **real application URL**, app fee, income multiple, amenities, **policies** (pets, utilities, screening) |
| `units.csv` | unit | unit #, beds, baths, rent, **AMI %** (0 = market), accessible, status, available date |
| `income_limits.csv` | property × AMI level | **current HUD/state limits** for household sizes 1–8 and the year |

Every AMI % used in `units.csv` needs a matching row in `income_limits.csv`; the
importer refuses otherwise. *The example numbers in the templates are samples, not HUD figures.*

### 2. Claude API key
Create a key at console.anthropic.com (Settings → API keys). Expected cost at
current settings (`effort: low`): roughly a few cents per conversation.

### 3. Twilio
- **Account SID** and **Auth Token** (Twilio Console home page)
- A **phone number** that can send SMS
- **A2P 10DLC registration** (brand + campaign). ⏱ This takes **1–3 weeks** and US carriers
  block unregistered business texting, so **start this first**. Campaign type: "Customer Care" /
  "Mixed"; sample messages can come from the demo conversations in the inbox.
- Your **test cell number(s)** for `LEASING_TEST_NUMBERS`

### 4. Decisions
- **Hosting.** The app uses SQLite. Pick one:
  - *Recommended:* a single always-on server with a persistent disk (Render, Railway, Fly.io, or a small VM). No code change needed.
  - Vercel/serverless: requires moving to Postgres first (about 1 hour of work).
- **Public domain** for the webhook, e.g. `leasing.fgwgroups.com` → `PUBLIC_BASE_URL`
- **Office / after-hours line**: the real number shown on every handoff and emergency reply (`FGW_OFFICE_PHONE`)
- **Compliance sign-off**: fair-housing review of the agent instructions in
  `src/lib/leasing/agent.ts` and the occupancy rule (2 per bedroom + 1) in `src/lib/leasing/eligibility.ts`

## Steps once inputs arrive

```bash
npm run leasing:import -- ./fgw-data            # validate only, writes nothing
npm run leasing:import -- ./fgw-data --apply    # load (safe to re-run after edits)
npm run leasing:clear-demo -- --apply           # remove demo properties + conversations
npm run leasing:check                           # must say READY
```

Put secrets in `.env.local` (git-ignored), not `.env`:
```
ANTHROPIC_API_KEY=...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
PUBLIC_BASE_URL=https://leasing.fgwgroups.com
FGW_OFFICE_PHONE=(xxx) xxx-xxxx
LEASING_TEST_NUMBERS=+1yourcell
LEASING_LIVE=false
```

Then:
1. Deploy. In Twilio, set the number's **A message comes in** webhook → `POST https://<domain>/api/leasing/sms`.
2. **Test-number pilot**: from your cell, text a few real scenarios (2BR availability, income
   pre-screen, Spanish, book a tour, "I need an accessible unit", "talk to a person", STOP/START).
   Review every thread in `/leasing`.
3. Get compliance sign-off on the pilot transcripts.
4. Set `LEASING_LIVE=true` and restart. ✅ Live.

**Rollback:** set `LEASING_LIVE=false` and restart, and all outbound SMS stops immediately.
Per-conversation: "Take over (pause AI)" on any thread.
