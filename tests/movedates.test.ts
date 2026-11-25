// Daily Rent Manager move-date read: filtering and the once-a-day tick. RM and the tracker are stubbed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { moveRowsFromLeases, runMoveDatesTick, _resetMoveDates } from "../src/lib/leasing/movedates";

const leases = [
  { LeaseID: 1, MoveInDate: "2026-12-01T00:00:00", MoveOutDate: null, Tenant: { Name: "Test Tenant A" }, Property: { Name: "604-606 Racine Ave" }, Unit: { Name: "604" } },
  { LeaseID: 2, MoveInDate: "2024-01-01T00:00:00", MoveOutDate: "2026-11-20T00:00:00", Tenant: { FirstName: "Test", LastName: "B" }, Property: { Name: "P" }, Unit: { Name: "U" } },
  { LeaseID: 3, MoveInDate: "2020-05-01T00:00:00", MoveOutDate: "0001-01-01T00:00:00", Tenant: { Name: "Old" } },
  { LeaseID: 4, ArrivalDate: "2027-03-01T00:00:00" },
];

test("keeps moves from 7 days back to 60 days ahead, sorted", () => {
  const rows = moveRowsFromLeases(leases, "2026-11-25");
  assert.deepEqual(rows.map((r) => [r.type, r.date, r.leaseId]), [
    ["Move-out", "2026-11-20", "2"],
    ["Move-in", "2026-12-01", "1"],
  ]);
  assert.equal(rows[0].tenant, "Test B");
  assert.equal(rows[1].property, "604-606 Racine Ave");
});

test("tick runs once per Eastern day after 6 AM and posts rows", async () => {
  process.env.RM_USERNAME = "u"; process.env.RM_PASSWORD = "p";
  process.env.TRACKER_WEBHOOK_URL = "https://example.invalid/hook"; process.env.TRACKER_WEBHOOK_TOKEN = "t";
  const posts: unknown[] = [];
  globalThis.fetch = (async (u: string, init?: { body?: string }) => {
    if (String(u).includes("AuthorizeUser")) return new Response(JSON.stringify("tok"), { status: 200 });
    if (String(u).includes("/Leases")) return new Response(JSON.stringify(leases), { status: 200 });
    posts.push(JSON.parse(init!.body!));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  _resetMoveDates();
  assert.deepEqual(await runMoveDatesTick(new Date("2026-11-25T10:00:00Z")), { ran: false }); // 5 AM ET
  const r = await runMoveDatesTick(new Date("2026-11-25T12:00:00Z")); // 7 AM ET
  assert.equal(r.ran, true);
  assert.equal(r.rows, 2);
  assert.equal((posts[0] as { kind: string }).kind, "move_dates");
  assert.deepEqual(await runMoveDatesTick(new Date("2026-11-25T20:00:00Z")), { ran: false }); // same day
  process.env.MOVEDATES_DISABLED = "true";
  _resetMoveDates();
  assert.deepEqual(await runMoveDatesTick(new Date("2026-11-26T12:00:00Z")), { ran: false });
});
