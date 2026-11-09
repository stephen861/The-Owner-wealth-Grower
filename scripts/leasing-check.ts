// Go-live readiness check for the FGW leasing agent.
//   npm run leasing:check
// Exit code 1 if any FAIL. Never sends a message or calls an external API.
import { PrismaClient } from "@prisma/client";
import { isValidTimeZone } from "../src/lib/leasing/time";
import { DEMO_PROPERTIES, DEMO_PROSPECT_WHERE } from "./demo-data";

const prisma = new PrismaClient();
type Level = "PASS" | "WARN" | "FAIL";
const results: { level: Level; area: string; msg: string }[] = [];
const add = (level: Level, area: string, msg: string) => results.push({ level, area, msg });
const env = (k: string) => (process.env[k] ?? "").trim();

async function main() {
  // ── Credentials & config ─────────────────────────────────────
  if (env("ANTHROPIC_API_KEY") || env("ANTHROPIC_AUTH_TOKEN")) add("PASS", "AI", "Claude API credential set");
  else add("FAIL", "AI", "ANTHROPIC_API_KEY not set — agent runs in holding-reply mode only");

  const sid = env("TWILIO_ACCOUNT_SID"), tok = env("TWILIO_AUTH_TOKEN"), from = env("TWILIO_FROM_NUMBER"), base = env("PUBLIC_BASE_URL");
  add(tok ? "PASS" : "FAIL", "SMS", tok ? "TWILIO_AUTH_TOKEN set (webhook signatures verified)" : "TWILIO_AUTH_TOKEN not set — webhook rejects all SMS in production");
  add(sid && /^AC[0-9a-f]{32}$/i.test(sid) ? "PASS" : "FAIL", "SMS", sid ? (/^AC/i.test(sid) ? "TWILIO_ACCOUNT_SID set" : "TWILIO_ACCOUNT_SID should start with AC") : "TWILIO_ACCOUNT_SID not set — needed for async replies + staff SMS");
  add(/^\+1\d{10}$/.test(from) ? "PASS" : "FAIL", "SMS", from ? (/^\+1\d{10}$/.test(from) ? `TWILIO_FROM_NUMBER ${from}` : `TWILIO_FROM_NUMBER "${from}" must be E.164, e.g. +14045550123`) : "TWILIO_FROM_NUMBER not set");
  if (/^https:\/\/[^/]+/.test(base) && !/localhost|127\.0\.0\.1/.test(base)) add("PASS", "SMS", `Webhook URL: ${base.replace(/\/$/, "")}/api/leasing/sms`);
  else add("FAIL", "SMS", "PUBLIC_BASE_URL must be your public https:// domain (Twilio signs requests against it)");

  const office = env("FGW_OFFICE_PHONE");
  const placeholder = /(^|\D)555(\D|$)/.test(office); // 555 numbers are fictional
  add(office && !placeholder ? "PASS" : "FAIL", "Config", !office ? "FGW_OFFICE_PHONE not set — shown on every handoff and emergency reply" : placeholder ? `FGW_OFFICE_PHONE is still the placeholder "${office}"` : `Office line ${office}`);

  const live = env("LEASING_LIVE") === "true";
  add(live ? "WARN" : "PASS", "Go-live", live ? "LEASING_LIVE=true — agent texts real prospects" : "LEASING_LIVE is off (dry run). Flip to true only after every FAIL is cleared.");
  const tests = env("LEASING_TEST_NUMBERS").split(",").filter(Boolean);
  add(tests.length ? "PASS" : "WARN", "Go-live", tests.length ? `${tests.length} test number(s) can receive SMS during dry run` : "No LEASING_TEST_NUMBERS — add your own cell to test SMS end-to-end before going live");

  if (/^file:/.test(env("DATABASE_URL"))) add("WARN", "Hosting", "SQLite database — fine on a single always-on server (VM/Render/Railway with a disk); not on serverless hosts like Vercel");

  // ── Listing data ─────────────────────────────────────────────
  const demo = await prisma.property.count({ where: { name: { in: DEMO_PROPERTIES } } });
  const demoProspects = await prisma.prospect.count({ where: DEMO_PROSPECT_WHERE });
  if (demo || demoProspects) add("FAIL", "Data", `Demo data still present (${demo} properties, ${demoProspects} prospects) — run npm run leasing:clear-demo -- --apply`);
  else add("PASS", "Data", "No demo data");

  const props = await prisma.property.findMany({ where: { active: true }, include: { units: true, incomeLimits: true } });
  const real = props.filter((p) => !DEMO_PROPERTIES.includes(p.name));
  if (real.length === 0) add("FAIL", "Data", "No real properties loaded — npm run leasing:import -- <folder> --apply");
  const year = new Date().getFullYear();
  for (const p of real) {
    const tag = `Data · ${p.name}`;
    const problems: string[] = [];
    if (!isValidTimeZone(p.timezone)) problems.push(`invalid timezone ${p.timezone}`);
    if (!p.applicationUrl || /example\.(com|org|net)|your-site\.com/.test(p.applicationUrl)) problems.push("no real application URL");
    if (!p.officePhone || /(^|\D)555(\D|$)/.test(p.officePhone)) problems.push("no real office phone");
    if (!p.policies) problems.push("no policies (pets, utilities, screening) — agent will escalate those questions");
    const available = p.units.filter((u) => u.status === "AVAILABLE");
    if (p.units.length === 0) problems.push("no units");
    const amis = [...new Set(p.units.filter((u) => u.amiPercent > 0).map((u) => u.amiPercent))];
    for (const a of amis) {
      const sizes = p.incomeLimits.filter((l) => l.amiPercent === a).map((l) => l.householdSize);
      const missing = [1, 2, 3, 4, 5, 6, 7, 8].filter((h) => !sizes.includes(h));
      if (missing.length) problems.push(`${a}% AMI limits missing for household size ${missing.join(",")}`);
    }
    const stale = p.incomeLimits.filter((l) => l.year != null && l.year < year - 1);
    const noYear = p.incomeLimits.filter((l) => l.year == null);
    if (problems.length) add("FAIL", tag, problems.join("; "));
    else add("PASS", tag, `${p.units.length} units (${available.length} available), limits for ${amis.map((a) => a + "%").join(", ") || "market only"}`);
    if (stale.length) add("WARN", tag, `income limits dated ${[...new Set(stale.map((l) => l.year))].join(",")} — confirm the current HUD year`);
    if (noYear.length) add("WARN", tag, "some income limits have no year — record the HUD year you used");
  }

  // ── Report ───────────────────────────────────────────────────
  const icon = { PASS: "✅", WARN: "⚠️ ", FAIL: "❌" };
  for (const r of results) console.log(`${icon[r.level]} ${r.area.padEnd(28)} ${r.msg}`);
  const fails = results.filter((r) => r.level === "FAIL").length;
  console.log(`\n${fails ? `❌ NOT READY — ${fails} blocker(s).` : "✅ READY — all blockers cleared. Do a test-number SMS run, then set LEASING_LIVE=true."}`);
  process.exitCode = fails ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
