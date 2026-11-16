import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_STATUSES, missingIntakeItems, staffReviewNote } from "../src/lib/leasing/intake";
import { readFileSync } from "node:fs";
import { parseWallTime, zonedToUtc } from "../src/lib/leasing/time";
import { parseCsv } from "../scripts/csv";

// FGW standing rule: the AI agent collects info only and never decides eligibility.
test("agent has no eligibility tool and returns no verdict", () => {
  const tools = readFileSync(new URL("../src/lib/leasing/tools.ts", import.meta.url), "utf8");
  assert.doesNotMatch(tools, /prescreen_eligibility|screenUnits|eligible_units|not_eligible/);
  assert.match(tools, /record_household_info/);
});
test("agent cannot set decision statuses", () => {
  assert.ok(!(AGENT_STATUSES as readonly string[]).includes("NOT_ELIGIBLE"));
  assert.ok(!(AGENT_STATUSES as readonly string[]).includes("LEASED"));
});
test("agent instructions forbid qualifying or gating", () => {
  const agent = readFileSync(new URL("../src/lib/leasing/agent.ts", import.meta.url), "utf8");
  assert.doesNotMatch(agent, /pre-?qualified, subject|prescreen_eligibility|2 per bedroom/i);
  assert.match(agent, /You never decide who qualifies/);
  assert.match(agent, /Anyone who asks may tour and may apply/);
});
test("intake lists what is missing for staff", () => {
  assert.equal(missingIntakeItems({}).length, 7);
  const full = { name: "A", phone: "+16145550100", bedroomsWanted: 2, moveInDate: new Date(), householdSize: 3, annualIncome: 40000, hasVoucher: true };
  assert.deepEqual(missingIntakeItems(full), []);
  assert.equal(staffReviewNote(full), "Intake complete. Ready for staff review");
  assert.match(staffReviewNote({ ...full, hasVoucher: null }), /Still missing: whether they have a housing voucher/);
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

test("staff session tokens: valid, expired and forged", async () => {
  const { createSessionToken, verifySessionToken, passwordMatches, isPublicPath } = await import("../src/lib/auth");
  const secret = "x".repeat(40);
  const t = await createSessionToken(secret, 1_000);
  assert.equal(await verifySessionToken(secret, t, 2_000), true);
  assert.equal(await verifySessionToken(secret, t, 1_000 + 13 * 3600_000), false); // expired after 12h
  assert.equal(await verifySessionToken("y".repeat(40), t, 2_000), false); // wrong secret
  const [exp, sig] = t.split(".");
  assert.equal(await verifySessionToken(secret, `${Number(exp) + 999999}.${sig}`, 2_000), false); // tampered expiry
  assert.equal(await verifySessionToken(secret, undefined), false);
  assert.equal(await passwordMatches(secret, "correct horse battery", "correct horse battery"), true);
  assert.equal(await passwordMatches(secret, "correct horse battery", "wrong"), false);
  assert.equal(isPublicPath("/chat"), true);
  assert.equal(isPublicPath("/api/leasing/sms"), true);
  assert.equal(isPublicPath("/leasing"), false);
  assert.equal(isPublicPath("/leasing/abc"), false);
  assert.equal(isPublicPath("/"), false);
});
test("tours are requests the FGW team confirms, never booked by the agent", () => {
  const tools = readFileSync(new URL("../src/lib/leasing/tools.ts", import.meta.url), "utf8");
  const agent = readFileSync(new URL("../src/lib/leasing/agent.ts", import.meta.url), "utf8");
  assert.doesNotMatch(tools, /schedule_tour|booked: true/);
  assert.match(tools, /name: "request_tour"/);
  assert.match(tools, /status: "REQUESTED"/);
  assert.match(tools, /confirmed: false/);
  assert.match(agent, /Never say a tour is booked, scheduled or confirmed/);
  const chat = readFileSync(new URL("../src/app/chat/ChatWidget.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(chat, /qualify|book a tour/i);
});
