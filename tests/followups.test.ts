// Prospect follow-up nudges on a throwaway SQLite DB. Twilio is stubbed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fgw-fu-"));
const A = "+16145550111";
const OPTOUT = "+16145550122";
const WEBONLY = "+16145550133";
process.env.DATABASE_URL = `file:${join(dir, "t.db")}`;
process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "test";
process.env.TWILIO_FROM_NUMBER = "+16148205332";
process.env.LEASING_LIVE = "true";
delete process.env.FOLLOWUPS_ENABLED;

const sent: { to: string; body: string }[] = [];
globalThis.fetch = (async (_u: unknown, init?: { body?: URLSearchParams }) => {
  const p = init?.body as URLSearchParams;
  sent.push({ to: p.get("To")!, body: p.get("Body")! });
  return new Response("{}", { status: 201 });
}) as typeof fetch;

let prisma: typeof import("../src/lib/prisma").prisma;
let fu: typeof import("../src/lib/leasing/followups");
let propertyId = "";

// 2026-11-16 10:00 EST = 15:00 UTC (inside 9am-8pm).
const T0 = new Date("2026-11-16T15:00:00Z");
const at = (days: number, hourUtc = 15) => new Date(T0.getTime() + days * 86400e3 + (hourUtc - 15) * 3600e3);

before(async () => {
  execSync("npx prisma db push --skip-generate", { env: process.env, stdio: "ignore" });
  prisma = (await import("../src/lib/prisma")).prisma;
  fu = await import("../src/lib/leasing/followups");
  propertyId = (await prisma.property.create({ data: { name: "48 S Richardson Ave", program: "MARKET" } })).id;
});
after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

async function lead(phone: string, opts: { channel?: string; optOut?: boolean; delivered?: boolean; name?: string } = {}) {
  const p = await prisma.prospect.create({
    data: { phone, name: opts.name ?? "Dana Smith", source: "SMS", propertyId, smsOptOut: opts.optOut ?? false },
  });
  await prisma.message.create({ data: { prospectId: p.id, direction: "IN", author: "PROSPECT", channel: opts.channel ?? "SMS", body: "Is it available?", createdAt: T0 } });
  await prisma.message.create({ data: { prospectId: p.id, direction: "OUT", author: "AGENT", channel: opts.channel ?? "SMS", body: "Yes!", delivered: opts.delivered ?? true, createdAt: new Date(T0.getTime() + 5000) } });
  return p;
}

test("nudges on day 1, 3 and 7, then stops", async () => {
  await lead(A);
  await lead(OPTOUT, { optOut: true });
  await lead(WEBONLY, { channel: "WEB" });
  await lead("+16145550144", { delivered: false });

  sent.length = 0;
  assert.equal((await fu.runFollowUpTick(at(0.5))).nudges, 0, "too soon");
  assert.equal((await fu.runFollowUpTick(at(1))).nudges, 1);
  assert.equal(sent[0].to, A);
  assert.match(sent[0].body, /^Hi Dana, it's FGW\. Still interested in 48 S Richardson Ave\?/);
  assert.equal((await fu.runFollowUpTick(at(1.01))).nudges, 0, "no double text");
  assert.equal((await fu.runFollowUpTick(at(3))).nudges, 1);
  assert.equal((await fu.runFollowUpTick(at(7))).nudges, 1);
  assert.match(sent[2].body, /^Last note from FGW/);
  assert.equal((await fu.runFollowUpTick(at(20))).nudges, 0, "three max");
  assert.ok(sent.every((s) => s.to === A), "never opted-out, web-only or held-before-go-live leads");
});

test("quiet hours: nothing before 9am or after 8pm Columbus time", async () => {
  await lead("+16145550155");
  sent.length = 0;
  assert.equal((await fu.runFollowUpTick(at(2, 12))).nudges, 0); // 7am EST
  assert.equal((await fu.runFollowUpTick(at(2, 2))).nudges, 0); // 9pm EST the night before
  assert.equal((await fu.runFollowUpTick(at(2, 14))).nudges, 1); // 9am EST
});

test("a reply restarts the clock; staff takeover or a tour stops it", async () => {
  const p = await lead("+16145550166");
  await fu.runFollowUpTick(at(1));
  await prisma.message.create({ data: { prospectId: p.id, direction: "IN", author: "PROSPECT", channel: "SMS", body: "maybe", createdAt: at(2) } });
  await prisma.message.create({ data: { prospectId: p.id, direction: "OUT", author: "AGENT", channel: "SMS", body: "ok", createdAt: at(2.001) } });
  sent.length = 0;
  await fu.runFollowUpTick(at(2.5));
  assert.equal(sent.length, 0);
  await fu.runFollowUpTick(at(3.01));
  assert.match(sent.find((x) => x.to === "+16145550166")?.body ?? "", /^Hi Dana/, "count restarted at nudge 1");

  const s = await lead("+16145550177");
  await prisma.prospect.update({ where: { id: s.id }, data: { aiEnabled: false } });
  const t = await lead("+16145550188");
  await prisma.tour.create({ data: { prospectId: t.id, propertyId, scheduledAt: at(9), status: "SCHEDULED", type: "IN_PERSON" } });
  sent.length = 0;
  await fu.runFollowUpTick(at(1));
  assert.ok(!sent.some((x) => x.to === "+16145550177" || x.to === "+16145550188"));
});

test("FOLLOWUPS_ENABLED=false turns it off", async () => {
  await lead("+16145550199");
  process.env.FOLLOWUPS_ENABLED = "false";
  try {
    assert.equal((await fu.runFollowUpTick(at(1))).nudges, 0);
  } finally {
    delete process.env.FOLLOWUPS_ENABLED;
  }
});
