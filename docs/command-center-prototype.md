# FGW / AFLH Command Center — synthetic prototype

A local, isolated prototype of an owner command center for FGW and AFLH, built
inside this existing app rather than as a second application. **Every row is
invented. Nothing connects to a live system.**

- Routes live under `/command-center`.
- Every table is prefixed `Demo*`.
- Run it: `npm install && npx prisma generate && npx prisma db push && npm run demo:seed && npm run dev`
- Tests: `npm test` (128 tests, 25 suites)
- Demonstration: `npm run demo:whiteboard`

## Scope boundaries this prototype respects

| Boundary | How it is enforced |
| --- | --- |
| No live integration | No HTTP client, no credential, no network call exists in any Command Center file. |
| No resident or employee data | No date-of-birth, government-ID, diagnosis, medication, eligibility or payroll field exists in the schema. Asserted by a test that inspects the stored row's keys. |
| No payments | No payment instrument, card, bank or transfer field or action. Money is a synthetic integer for reporting only. |
| No external messages | No mail, SMS or webhook sender. |
| No production deployment | Local only. Nothing is deployed, and no PR is opened or merged. |
| No credential or permission operations | None requested, read or written. |
| Existing workflows untouched | No file outside `/command-center`, `src/lib/command-center/`, `tests/`, `scripts/` and additive schema blocks was modified. Existing routes were re-checked after the build and all return 200. |
| Rent Manager / InSync | Out of scope. This prototype neither replaces, mirrors nor writes to either. |

### A note on an earlier commit in this branch's history

Commit `24ad1fa` is titled "Add property management core to replace Rent
Manager", from an earlier instruction in this session. That module is left
exactly as it was — it is not extended here, and the Command Center does not
build on it or depend on it. Per the current instruction, nothing in this
prototype replaces Rent Manager or InSync. If that earlier module should be
removed or retitled, say so and it is a separate, clean change.

## Reuse decisions

Reused rather than rebuilt:

| Reused | Why |
| --- | --- |
| `src/lib/prisma.ts` | Same singleton client; no second connection pool. |
| `src/lib/format.ts` | `formatCurrency`, `formatDate`, `daysUntil`, `labelFor`, `OPEN_WORK_ORDER_STATUS` and the `labelFor` list convention. |
| `src/lib/form.ts` | The `str` / `flt` / `date` form parsers used by the existing server actions. |
| `src/app/globals.css` | The whole visual system — `.panel`, `.cards`, `.card`, `.badge`, `.btn`, `form.grid`, `.field`, `.stage-form`, `.subnote`, `.cc-mono`. Only additive classes were appended. |
| Server Actions + server components | Same data-flow pattern as the rest of the app: no new API layer, no client-side store. |
| Sidebar / sub-nav pattern | `CcNav` follows the existing `Sidebar` active-link pattern. |

Deliberate divergences, and why:

| Divergence | Reason |
| --- | --- |
| Money stored as integer **cents**, not `Float` | The existing models use `Float`. For a reporting surface with totals, floats drift. A `formatCents` helper wraps the existing `formatCurrency`, so the UI is consistent. Noted as an inconsistency with the older tables, not a change to them. |
| `Demo*` table prefix | Guarantees isolation and makes the reset safe to reason about: the reset deletes only prefixed tables. |
| Division as a typed field, not separate tables | RCF and FGW properties share a shape. One typed field means one filter serves every screen, which is what the audit's two-base split made awkward. |
| Pure domain layer (`domain.ts`) | All rules are pure functions over plain objects, so they test without a database or a server. The existing code puts logic inline in pages; that is fine there, untestable here. |
| `node:test` + `tsx` for tests | The repo had no test setup. This adds **zero** new dependencies — `tsx` was already present. |

## The four source defects, designed out

Each one is a behaviour change, not a note. Each has tests named after it.

### 1. Fees Owed was hard-coded `650 − total fees`

Every property shared one expected amount, and an overpayment surfaced as a
negative balance indistinguishable from a debt.

**Now:** `DemoProperty.expectedFeesCents` is per-property and editable on the
Readiness screen. `feePosition()` returns `owedCents` and `creditCents` as
separate non-negative figures plus a typed state — `OWED`, `SETTLED`, `CREDIT`
or `NOT_CONFIGURED`. A facility with no expected fee configured is flagged
rather than silently reported as owing nothing.

### 2. Revenue was contingent on an exact `"Licensed"` string

`"licensed"`, `"Licensed "` or `"License Pending"` all produced zero revenue
with no indication anything was wrong.

**Now:** `licenseStatus` is a typed enum, the raw source string is kept beside
it in `licenseStatusRaw`, and `revenueEligible` is its **own stored field**
rather than a derived string comparison. `assessRevenueEligibility()` raises an
explicit mismatch warning when the raw string maps to a different typed status,
when it cannot be mapped at all, or when the stored eligibility flag contradicts
the typed status. Mismatches are listed on the Overview screen. A case or
spacing variant produces **no** warning and full eligibility — it is simply
handled.

### 3. Approval notes contradicted the blocked state

A note reading "approved" could sit on a record that was still blocked, with
nothing reconciling the two.

**Now:** `blocked` is authoritative. `evaluateApprovalGate()` refuses an
approval while the subject is blocked, and if the note *reads* like an approval
it adds a mismatch warning naming the contradiction. The Approve button is
disabled in the UI and the server action re-checks the gate, so the refusal is
not merely cosmetic. Refusals are written to the audit log. A separate
`approvalConsistencyWarnings()` sweep flags already-decided rows whose state and
note disagree — surfaced on the Approvals screen under "Contradictions needing
reconciliation".

Also enforced: every decision requires a **named person**, and there is no
automated, agent or scheduled path to a decision. Rejecting a blocked subject
*is* allowed, so a block cannot trap a request as undecidable.

### 4. Duplicate Money Log / Jobs relationship columns

Two parallel link columns meant the same row could attach twice with no
canonical path.

**Now:** `DemoMoneyEntry` has exactly one foreign key per dimension —
`propertyId`, `jobId`, `vendorId`. `jobCostRollup()` attributes spend through
`jobId` alone. A test walks the relationship from both directions and asserts
the two agree exactly, and another asserts no entry is counted under more than
one job.

## Referral pipeline — administrative only

Stages, in order and fixed:

`RECEIVED → FOLLOW_UP → DOCUMENTS_PENDING → HUMAN_REVIEW → HUMAN_DECISION_RECORDED → MOVE_IN_CHECKLIST`

Rules enforced by `evaluateReferralTransition()`:

- A blocked referral cannot advance at all.
- Stages advance one step at a time — human review cannot be skipped.
- `HUMAN_DECISION_RECORDED` and `MOVE_IN_CHECKLIST` require the **name of the
  person** who recorded the decision.
- Moving backwards is permitted but warned about.

**No clinical admission or eligibility decision is made anywhere.** The pipeline
records *that a person decided and who they were*. There is no suitability
score, no eligibility field and no automated assessment. The schema carries no
clinical or health column to score against.

## Whiteboard projection — synthetic, outbound-only, not connected

### What it is and is not

The `/command-center/whiteboard` screen renders a **local projection board**.
It is not a live view of a Claude artifact, and this app never reads or edits
one. The screen says so in a red notice at the top.

Declared and tested capabilities (`WHITEBOARD_ADAPTER_CAPABILITIES`):

| Capability | Value |
| --- | --- |
| Outbound projection | yes |
| Reverse write | **no** |
| Network access | **no** |
| Live artifact sync | **no** |
| Autonomous apply | **no** |

One-way by construction: the module exports no function that accepts a board
payload and mutates app records. A test scans the module's export surface for
any `applyFrom*`, `importFrom*`, `writeBack*`, `pullFrom*`, `syncFrom*` or
`ingest*` name and fails if one appears. Content observed on a board is never
trusted as input.

### Why the allowlist is strict

Both recorded boards are **shared with anyone who has the link**. Synthetic is
not treated as sufficient for a public surface.

Projected: stable card IDs, source **codes**, typed uppercase status tokens,
integer counts, and a blocked-reason **slug**.

Never projected: amounts or any money figure, person names, addresses, emails,
phone numbers, occupant identifiers, free-text notes or evidence text, and
**per-referral records** — referrals appear only as stage counts. Facilities
appear as source codes, never names. An operator's free-text blocked reason is
reduced to a slug such as `AWAITING_PERMIT`.

Enforcement is two-layer:

1. `sanitizeCard()` whitelists keys and validates shape — codes must match a
   safe pattern, statuses and reasons must be uppercase tokens, and metric
   values must be **integers**, so an amount cannot ride along as a "count".
2. `auditProjection()` re-scans the serialized cards for leak patterns —
   currency symbols, money-named JSON keys, money-named metric keys,
   money-shaped decimals, `@`, phone shapes, `FICTIONAL`, street words and
   occupant markers. If a future card builder forgets to sanitize, the audit
   fails loudly and the screen refuses to present the payload as publishable.

### Stable IDs, versions and hashes

Card IDs derive from **source IDs**, not database `cuid`s, so reseeding the demo
dataset reproduces identical IDs — the same property the board's `R-xx` IDs
have. The content hash covers card content with `version` and `updatedAt`
excluded, so a regenerated-but-unchanged payload hashes identically and a no-op
is detectable.

### Duplicate and stale rejection

`decideApply()` returns one of: `APPLIED`, `REJECTED_DUPLICATE`,
`REJECTED_STALE`, `REJECTED_VERSION_CONFLICT`, `REJECTED_UNKNOWN_TARGET`,
`REJECTED_DISABLED`.

- Same version + same content → duplicate replay, rejected.
- **Same version + different content → version conflict**, rejected. This is the
  case a timestamp alone would hide.
- Lower version than applied → stale.
- Generated before the last success → stale, out-of-order delivery.
- A rejection is **not** a transport failure: it does not reset last-success and
  does not increment the failure counter.

### Honest status — timestamps are not correctness

- An earlier success never masks a later failure: that state is reported as
  `SUCCEEDED_THEN_FAILED` with the label "FAILING".
- A lapsed cadence reports `STALE_SUCCESS`, not `OK`.
- `verified` is **always false**. A successful apply is not evidence the board
  rendered the payload correctly. A "last synced" label on a board is a claim,
  not evidence.

This is the direct lesson from the audited board: it carries
`SCHEDULED daily 8:04 AM ET · Last synced 2026-11-15 08:07 ET` **and** older
agent names and a `R-TEST` row, while the Make scenario behind referral alerts
has never run. The label and the reality disagree, so the prototype refuses to
derive health from a schedule or a timestamp.

### How to actually apply a projection to the Claude board

**There is no programmatic board API used or assumed here, and this prototype
has no write access to the recorded boards.** The supported route is a
deliberate human step:

1. Generate a projection on the Whiteboard screen (or from the demo script) and
   take the payload.
2. A person opens the target board in Claude and asks for the card set to be
   updated from that payload, reviews the diff, and re-publishes the board. In a
   Claude Code session that holds the artifact tool, updating an existing
   artifact requires reading it first and then publishing to the same URL — a
   person initiates and reviews that, it is not wired to anything here.
3. Because the board is link-shared, **only the allowlisted payload may be
   pasted** — never a command-center screenshot, a money figure, a name or an
   address.
4. Record the outcome against the target so last-success and last-error stay
   truthful. An apply that was not confirmed stays **unverified**.

Stable card IDs mean a re-apply updates the same card rather than appending a
duplicate.

**Known limitation, asserted by a test rather than hidden:** card IDs for agents
derive from the agent's name, so renaming an automation yields a *new* card and
the superseded card must be pruned by hand. That is precisely how stale agent
names survive on a board.

### The existing boards and sheet

Not read, not written, not edited by this prototype or by me while building it.
The two URLs are recorded as documentation targets, stored with `enabled =
false`, and no code path sets that flag. An apply attempt against either is
refused as `REJECTED_DISABLED`, which the Whiteboard screen demonstrates. The
`local-projection` target is the only enabled one, and it resolves to
`local://command-center/whiteboard`.

## Integration status — stated, never inferred

| Integration | State |
| --- | --- |
| Airtable base (AFLH + FGW Command Center) | **NOT CONNECTED** — no credential, no client, no request, no row fetched or migrated |
| Airtable native automations | **UNDEPLOYED — NO PROOF OF LIVE SYNC** |
| AFLH New Referral Alert (Make 5266184) | **OFF — NEVER RUN**; it resets status to Pending. Nothing here turns it on or depends on it |
| Mina call/email digest | **SEPARATE — FORWARDING UNVERIFIED** |
| Claude boards (AI team / roadmap) | **DOCUMENTED TARGET ONLY**, disabled |
| Rent Manager / InSync | **UNTOUCHED** |

## Synthetic dataset

One dataset, `Demo dataset v1 (synthetic)`, deterministic from a fixed seed, so
a reset reproduces identical totals (asserted by a test). A **Reset demo data**
button sits in the banner on every Command Center screen.

Row counts mirror the audited source shape so the prototype behaves at realistic
scale — **525 rows across 12 tables**. Mirroring a *count* is not a claim that
any row matches a real one.

| Source table | Audited | Synthetic | Prototype module | Status |
| --- | --- | --- | --- | --- |
| RCF Properties | 7 | 7 | Readiness (facilities) | MODELLED |
| FGW Properties | 29 | 29 | Readiness / Overview | MODELLED |
| RCF Checklist Items | 49 | 49 | Readiness | MODELLED |
| Residents | 4 | 4 | Readiness — occupancy counts only | **REDUCED** |
| FGW Tasks | 32 | 32 | Tasks | MODELLED |
| Work Orders | 37 | 37 | Work orders | MODELLED |
| Jobs | 12 | 12 | Jobs & cost | MODELLED |
| Money Log | 147 | 147 | Jobs & cost / Overview | MODELLED |
| Advances | 2 | 2 | Jobs & cost | MODELLED |
| Furnishing & Supplies | 73 | 73 | stored, no screen | STORED |
| Contacts | 126 | 126 | stored, no screen | STORED |
| SOP Reference | 7 | 7 | stored, no screen | STORED |

**Residents is deliberately REDUCED** to an occupancy status and a fictional
label. No personal, clinical or identity field exists, and occupancy never
reaches the whiteboard projection.

Fictional-data conventions, asserted by tests: contact names carry `FICTIONAL`,
emails use the reserved `.invalid` TLD, phone numbers use the reserved `555-01xx`
block, addresses use reserved example street names, facility and vendor names are
prefixed `DEMO`.

### AFLH Operations Hub (separate base)

Ten tables, all empty in the audit. Nine were named — hiring, staff, compliance,
coverage, onboarding, training, performance, incidents, referrals — and **the
tenth was not identified**. None is modelled. The Modules screen lists them as
`EMPTY / NOT MODELLED`, and the unidentified tenth as `UNKNOWN`, rather than
inventing it.

## Import mapping & reconciliation — documentation only

**There is no importer.** `reconcileBySourceId()` runs against a fixture to
demonstrate the contract a future importer would have to satisfy. No fixture row
is ever written, asserted by a test that the stored work-order count is unchanged
after reconciliation.

Rules:

- Identity is the pair `(division, sourceId)`. The same ID in FGW and AFLH is two
  records, not a collision.
- Surrounding whitespace is ignored, so `" WO-1 "` is not a second identity.
- A repeat of an existing key is **rejected and reported** — never merged
  silently, never inserted twice. The database enforces this independently with a
  unique index on `(division, sourceId)`, and a test asserts the insert is
  rejected.
- A row with no source ID cannot be reconciled and is quarantined, not guessed at.
- Money attaches through one canonical FK per dimension.

Source IDs are prefixed with the division they belong to (`AFLH-WO-001`,
`FGW-J-002`). An earlier draft prefixed every row `FGW-` regardless of division,
so a prefix could claim a division the row was not in; that was found by a test
and fixed.

## Screens

| Route | Purpose |
| --- | --- |
| `/command-center` | Owner overview, FGW/AFLH filter, status mismatches, referral funnel, agent health, fee position |
| `/command-center/readiness` | Per-facility checklist, license status, configurable expected fees, occupancy counts |
| `/command-center/referrals` | The six administrative stages, with the gate's refusals shown inline |
| `/command-center/tasks` | Tasks and assignments |
| `/command-center/work-orders` | Work orders with their source ID |
| `/command-center/jobs` | Jobs, vendors, cost rollup, advances |
| `/command-center/agents` | Check-in, last evidence, blocked status |
| `/command-center/approvals` | Approval queue, gate refusals, contradictions, audit history |
| `/command-center/whiteboard` | Local projection board, export contract, targets, event log, apply instructions |
| `/command-center/modules` | Mirrored tables, integration status, import mapping, reconciliation demo |

The division filter is in the sub-nav and applies to every screen.

## Test coverage

128 tests, 25 suites, `npm test`.

| Area | What is asserted |
| --- | --- |
| Totals | Exact integer-cent sums; division subtotals reconstruct the whole; fee position across all four states; job cost attributed exactly once |
| Relationships | Every checklist item resolves to a facility; the job↔money relation agrees from both directions; no entry counted under two jobs; cascade deletes do not touch a sibling's rows |
| Filtering | `FGW + AFLH = ALL` across six tables; a filter returns only its own division; the filter value is validated |
| Approval gate | Refused while blocked; refused with no named decider; refused for any non-human actor; refused twice; mismatch warning when the note contradicts the block; rejection of a blocked subject allowed |
| Duplicate source ID | First occurrence kept and later ones reported; division-scoped; whitespace-insensitive; blank/null quarantined; DB unique index rejects a second insert; fixture never written |
| Whiteboard | Stable IDs across regenerations; allowlist shape enforcement; leak audit clean on a full projection and failing on a tampered one; duplicate/stale/conflict rejection; failed sync stays failed; no reverse-write export surface |
| Data hygiene | No contact looks real; no banned personal field exists on a placement |

## Gaps and what is deliberately not built

- **No importer.** Mapping and reconciliation are documented and tested against a
  fixture only.
- **No live board sync.** Applying a projection is a manual human step. No board
  API is used or assumed.
- **No authentication or multi-user model.** Single-operator, local.
- **`actorIsHuman` is asserted, not proven.** The approval action hard-codes it
  because the action is only reachable from a UI form. Real enforcement needs
  authentication, which is out of scope here.
- **No clinical, eligibility, payroll, payment or messaging capability** — by
  instruction, and absent from the schema rather than merely unexposed.
- **Agent rename orphans a card** (above).
- **Money is `Int` cents here but `Float` in the older tables.** Inconsistent
  across the repo; the older tables were not touched.
- **The tenth Operations Hub table is unidentified** and was not invented.
- **Furnishing & Supplies, Contacts and SOP Reference are stored without a
  dedicated screen** — present in the data model and counted on the Modules
  screen, not yet surfaced.
