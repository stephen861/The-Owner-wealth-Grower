import { test } from "node:test";
import assert from "node:assert/strict";
import { maxIncomeFor, screenUnits, type LimitRow, type UnitRow } from "../src/lib/leasing/eligibility";
import { parseWallTime, zonedToUtc } from "../src/lib/leasing/time";
import { parseCsv } from "../scripts/csv";

const limits60 = [45360, 51840, 58320, 64740, 69960, 75120, 80340, 85500];
const limits: LimitRow[] = [30, 60].flatMap((ami) =>
  limits60.map((m, i) => ({ amiPercent: ami, householdSize: i + 1, maxIncome: Math.round((m * ami) / 60) })),
);
const unit = (o: Partial<UnitRow>): UnitRow => ({
  id: "u", unitNumber: "1", bedrooms: 2, rent: 1000, amiPercent: 60, accessible: false, status: "AVAILABLE", availableDate: null, ...o,
});
const screen = (u: UnitRow, householdSize: number, annualIncome: number, hasVoucher = false) =>
  screenUnits({ units: [u], limits, householdSize, annualIncome, hasVoucher, minIncomeMultiple: 2 })[0];

test("income at the limit qualifies; $1 over does not", () => {
  assert.equal(screen(unit({}), 3, 58320).eligible, true);
  assert.equal(screen(unit({}), 3, 58321).eligible, false);
});
test("rent minimum applies without a voucher and is waived with one", () => {
  const u = unit({ rent: 1000 }); // needs $24,000/yr
  assert.equal(screen(u, 2, 23000).eligible, false);
  assert.equal(screen(u, 2, 23000, true).eligible, true);
});
test("market-rate units skip AMI limits", () => {
  assert.equal(screen(unit({ amiPercent: 0, rent: 1000 }), 2, 500000).eligible, true);
});
test("occupancy: 2 per bedroom + 1", () => {
  assert.equal(screen(unit({ bedrooms: 1, rent: 500 }), 3, 30000).eligible, true);
  assert.equal(screen(unit({ bedrooms: 1, rent: 500 }), 4, 30000).eligible, false);
});
test("missing AMI table routes to staff instead of guessing", () => {
  const r = screen(unit({ amiPercent: 50 }), 2, 30000);
  assert.equal(r.eligible, false);
  assert.match(r.reasons[0], /staff review/);
});
test("households over 8 extend the table", () => {
  assert.ok((maxIncomeFor(limits, 60, 9) ?? 0) > 85500);
});
test("tour times convert from property local time, across DST", () => {
  const w = parseWallTime("2026-07-15T10:00")!;
  assert.equal(zonedToUtc(w, "America/New_York").toISOString(), "2026-07-15T14:00:00.000Z"); // EDT
  assert.equal(zonedToUtc(parseWallTime("2026-12-15T10:00")!, "America/New_York").toISOString(), "2026-12-15T15:00:00.000Z"); // EST
  assert.equal(zonedToUtc(w, "America/Los_Angeles").toISOString(), "2026-07-15T17:00:00.000Z");
  assert.equal(parseWallTime("2026-11-15T10:00")!.weekday, 0); // Sunday
  assert.equal(parseWallTime("bad"), null);
});
test("CSV parser handles quotes, commas and CRLF", () => {
  const rows = parseCsv('name,policies\r\n"A, B","Says ""hi"""\r\n');
  assert.deepEqual(rows, [{ name: "A, B", policies: 'Says "hi"' }]);
});
test("tour confirmation text formats in the property zone", async () => {
  const { formatInZone } = await import("../src/lib/leasing/time");
  const d = new Date("2026-07-15T14:00:00Z");
  assert.match(formatInZone(d, "America/New_York"), /10:00\s?AM EDT$/);
  assert.match(formatInZone(d, "America/Chicago", "medium"), /9:00\s?AM CDT$/);
});
