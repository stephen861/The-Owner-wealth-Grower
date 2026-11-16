// End-to-end test of the tour confirmation loop on a throwaway SQLite DB.
// Twilio is stubbed: sends are captured, nothing leaves the machine.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fgw-tours-"));
const PROSPECT = "+16145550111";
const GEORGE = "+16145550199";
const OUTSIDER = "+16145550188";

process.env.DATABASE_URL = `file:${join(dir, "t.db")}`;
process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "test";
process.env.TWILIO_FROM_NUMBER = "+16148205332";
process.env.LEASING_LIVE = "false";
process.env.LEASING_TEST_NUMBERS = `${PROSPECT},${GEORGE}`;
process.env.TOUR_CONFIRMER_PHONE = GEORGE;
delete process.env.TOUR_BOOKING_MODE;

const sent: { to: string; body: string }[] = [];
globalThis.fetch = (async (_url: unknown, init?: { body?: URLSearchParams }) => {
  const p = init?.body as URLSearchParams;
  sent.push({ to: p.get("To")!, body: p.get("Body")! });
  return new Response("{}", { status: 201 });
}) as typeof fetch;

type Mods = {
  prisma: typeof import("../src/lib/prisma").prisma;
  tours: typeof import("../src/lib/leasing/tours");
  tools: typeof import("../src/lib/leasing/tools");
};
let m: Mods;
let propertyId = "";

// Next Monday 10:00 Columbus time, always in the future.
function nextMondayAt(hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
}

before(async () => {
  execSync("npx prisma db push --skip-generate", { env: process.env, stdio: "ignore" });
  m = {
    prisma: (await import("../src/lib/prisma")).prisma,
    tours: await import("../src/lib/leasing/tours"),
    tools: await import("../src/lib/leasing/tools"),
  };
  const prop = await m.prisma.property.create({
    data: { name: "48 S Richardson Ave", address: "48 S Richardson Ave, Columbus, OH", city: "Columbus", state: "OH", timezone: "America/New_York", program: "MARKET" },
  });
  propertyId = prop.id;
});
after(async () => {
  await m?.prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

async function requestTour(phone: string, hour: number) {
  const p = await m.prisma.prospect.upsert({ where: { phone }, update: {}, create: { phone, source: "SMS", name: "Test Lead" } });
  const out = JSON.parse(await m.tools.runLeasingTool(p.id, "request_tour", { property_id: propertyId, datetime: nextMondayAt(hour), tour_type: "IN_PERSON" }));
  const tour = await m.prisma.tour.findUniqueOrThrow({ where: { id: out.tour_id } });
  return { out, tour, prospect: p };
}

test("request texts the confirmer with a code and stays a request", async () => {
  sent.length = 0;
  const { out, tour } = await requestTour(PROSPECT, 10);
  assert.equal(out.confirmed, false);
  assert.equal(tour.status, "REQUESTED");
  assert.match(tour.code!, /^\d{4}$/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, GEORGE);
  assert.match(sent[0].body, new RegExp(`Reply YES ${tour.code} to confirm or NO ${tour.code}`));
});

test("YES <code> from the confirmer confirms and texts the prospect", async () => {
  const tour = await m.prisma.tour.findFirstOrThrow({ where: { status: "REQUESTED" } });
  sent.length = 0;
  const reply = await m.tours.handleConfirmerSms(GEORGE, `yes ${tour.code}`);
  assert.match(reply!, /^Confirmed/);
  const t = await m.prisma.tour.findUniqueOrThrow({ where: { id: tour.id }, include: { prospect: true } });
  assert.equal(t.status, "SCHEDULED");
  assert.ok(t.confirmedAt);
  assert.equal(t.prospect.needsHuman, false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, PROSPECT);
  assert.match(sent[0].body, /is confirmed for/);
});

test("the same command from anyone else is ignored", async () => {
  const tour = await m.prisma.tour.findFirstOrThrow({ where: { status: "SCHEDULED" } });
  assert.equal(await m.tours.handleConfirmerSms(PROSPECT, `no ${tour.code}`), null);
  assert.equal((await m.prisma.tour.findUniqueOrThrow({ where: { id: tour.id } })).status, "SCHEDULED");
});

test("ordinary texts from the confirmer still go to the agent", async () => {
  assert.equal(await m.tours.handleConfirmerSms(GEORGE, "Is the Richardson house still open?"), null);
});

test("NO <code> declines and asks the prospect for another time", async () => {
  const { tour } = await requestTour(PROSPECT, 13);
  sent.length = 0;
  const reply = await m.tours.handleConfirmerSms(GEORGE, `NO #${tour.code}`);
  assert.match(reply!, /^Declined/);
  assert.equal((await m.prisma.tour.findUniqueOrThrow({ where: { id: tour.id } })).status, "CANCELLED");
  assert.equal(sent[0].to, PROSPECT);
  assert.match(sent[0].body, /another day and time/);
});

test("bare YES works only when exactly one request is waiting", async () => {
  const a = await requestTour(PROSPECT, 15);
  assert.match((await m.tours.handleConfirmerSms(GEORGE, "YES"))!, /^Confirmed/);
  assert.equal((await m.prisma.tour.findUniqueOrThrow({ where: { id: a.tour.id } })).status, "SCHEDULED");
  await requestTour(PROSPECT, 11);
  await requestTour(PROSPECT, 16);
  assert.match((await m.tours.handleConfirmerSms(GEORGE, "yes"))!, /More than one tour is waiting/);
});

test("morning reminder and outcome question fire once each", async () => {
  const t = await m.prisma.tour.findFirstOrThrow({ where: { status: "SCHEDULED", code: { not: null } }, orderBy: { scheduledAt: "asc" } });
  // 9:00 the same morning, Columbus time.
  const morning = new Date(t.scheduledAt.getTime() - 60 * 60e3);
  await m.prisma.tour.update({ where: { id: t.id }, data: { reminderSentAt: null, confirmedAt: new Date(t.scheduledAt.getTime() - 2 * 24 * 3600e3) } });
  sent.length = 0;
  const r1 = await m.tours.runTourTick(morning);
  assert.ok(r1.reminders >= 1);
  assert.ok(sent.some((s) => s.to === PROSPECT && /Reminder: your tour/.test(s.body)));
  const again = await m.tours.runTourTick(morning);
  assert.equal(again.reminders, 0);

  sent.length = 0;
  const later = new Date(t.scheduledAt.getTime() + 2 * 3600e3);
  await m.tours.runTourTick(later);
  const ask = sent.find((s) => s.to === GEORGE && s.body.includes(`SHOWED ${t.code}`));
  assert.ok(ask, "confirmer asked how it went");
  assert.match((await m.tours.handleConfirmerSms(GEORGE, `showed ${t.code}`))!, /showed/);
  assert.equal((await m.prisma.tour.findUniqueOrThrow({ where: { id: t.id } })).status, "COMPLETED");
});

test("nothing reaches numbers outside the test list before go-live", async () => {
  sent.length = 0;
  const { tour } = await requestTour(OUTSIDER, 12);
  await m.tours.handleConfirmerSms(GEORGE, `yes ${tour.code}`);
  assert.ok(!sent.some((s) => s.to === OUTSIDER));
  const held = await m.prisma.message.findFirstOrThrow({ where: { prospect: { phone: OUTSIDER } }, orderBy: { createdAt: "desc" } });
  assert.equal(held.delivered, false);
});

test("auto mode books an open slot and only gives the confirmer a heads-up", async () => {
  process.env.TOUR_BOOKING_MODE = "auto";
  try {
    sent.length = 0;
    const { out, tour } = await requestTour(PROSPECT, 14);
    assert.equal(out.confirmed, true);
    assert.equal(tour.status, "SCHEDULED");
    assert.match(sent[0].body, new RegExp(`tour booked #${tour.code}.*Reply NO ${tour.code} to cancel`));
  } finally {
    delete process.env.TOUR_BOOKING_MODE;
  }
});
