// Tracker sync: row contents and webhook post. Fetch is stubbed; throwaway SQLite DB.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fgw-tr-"));
process.env.DATABASE_URL = `file:${join(dir, "t.db")}`;
delete process.env.TRACKER_WEBHOOK_URL;
delete process.env.TRACKER_WEBHOOK_TOKEN;

const posts: { url: string; body: Record<string, unknown> }[] = [];
globalThis.fetch = (async (u: unknown, init?: { body?: string }) => {
  posts.push({ url: String(u), body: JSON.parse(String(init?.body)) });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}) as typeof fetch;

let prisma: typeof import("../src/lib/prisma").prisma;
let tr: typeof import("../src/lib/leasing/tracker");
let prospectId = "";

before(async () => {
  execSync("npx prisma db push --skip-generate", { env: process.env, stdio: "ignore" });
  prisma = (await import("../src/lib/prisma")).prisma;
  tr = await import("../src/lib/leasing/tracker");
  const prop = await prisma.property.create({ data: { name: "48 S Richardson Ave", program: "MARKET" } });
  const p = await prisma.prospect.create({
    data: { phone: "+16145550199", name: "Jane", source: "SMS", propertyId: prop.id, annualIncome: 40000, householdSize: 3, bedroomsWanted: 2 },
  });
  prospectId = p.id;
  await prisma.message.create({ data: { prospectId, direction: "IN", author: "PROSPECT", channel: "SMS", body: "Can I see it Saturday?" } });
  await prisma.message.create({ data: { prospectId, direction: "OUT", author: "AGENT", channel: "SMS", body: "Sure, 11 AM works." } });
});

after(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

test("row has the lead and no income or household details", async () => {
  const row = await tr.trackerRow(prospectId);
  assert.ok(row);
  assert.equal(row.name, "Jane");
  assert.equal(row.home, "48 S Richardson Ave");
  assert.equal(row.lastIn, "Can I see it Saturday?");
  assert.equal(row.lastOut, "Sure, 11 AM works.");
  assert.equal(row.bedrooms, 2);
  const text = JSON.stringify(row);
  assert.ok(!text.includes("40000") && !("annualIncome" in row) && !("householdSize" in row));
});

test("does nothing unless both settings are present", async () => {
  tr.syncProspectToTracker(prospectId);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(posts.length, 0);
});

test("posts the row with the token when configured", async () => {
  process.env.TRACKER_WEBHOOK_URL = "https://script.google.com/macros/s/test/exec";
  process.env.TRACKER_WEBHOOK_TOKEN = "tok";
  tr.syncProspectToTracker(prospectId);
  for (let i = 0; i < 40 && posts.length === 0; i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.token, "tok");
  assert.equal(posts[0].body.kind, "agent_lead");
  assert.equal((posts[0].body.lead as { id: string }).id, prospectId);
  delete process.env.TRACKER_WEBHOOK_URL;
  delete process.env.TRACKER_WEBHOOK_TOKEN;
});
