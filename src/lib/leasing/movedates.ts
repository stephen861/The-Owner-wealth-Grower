/**
 * Daily move-date read (owner's yes, Nov 25 2026): once a day after 6 AM Eastern,
 * read move-in and move-out dates from Rent Manager and write them to the
 * "RM Move Dates" tab of the FGW Leasing Tracker, which the move-in / move-out
 * follow-ups work from.
 *
 * Read only in Rent Manager. Sends nothing to tenants. Only type, date, tenant
 * name, property, unit and lease id leave Rent Manager; no money, income or
 * screening details.
 *
 * Off unless Rent Manager and the tracker webhook are both set up, or when
 * MOVEDATES_DISABLED=true.
 */
import { rm } from "./rentmanager";

export type MoveRow = { type: "Move-in" | "Move-out"; date: string; tenant: string; property: string; unit: string; leaseId: string };

const DAYS_BACK = 7;
const DAYS_AHEAD = 60;
const RUN_HOUR_ET = 6;

type Rec = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const day = (v: unknown) => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(str(v));
  return m && !m[1].startsWith("0001") && !m[1].startsWith("1900") ? m[1] : "";
};
const nameOf = (o: unknown, ...keys: string[]) => {
  if (!o || typeof o !== "object") return "";
  for (const k of keys) { const s = str((o as Rec)[k]); if (s) return s; }
  return "";
};

function tenantName(t: unknown): string {
  const n = nameOf(t, "Name", "DisplayName");
  if (n) return n;
  return [nameOf(t, "FirstName"), nameOf(t, "LastName")].filter(Boolean).join(" ");
}

/** Turn Rent Manager leases into move rows within [today - 7, today + 60] (dates as YYYY-MM-DD). */
export function moveRowsFromLeases(leases: unknown[], todayIso: string): MoveRow[] {
  const t0 = Date.parse(`${todayIso}T00:00:00Z`);
  const lo = new Date(t0 - DAYS_BACK * 86_400_000).toISOString().slice(0, 10);
  const hi = new Date(t0 + DAYS_AHEAD * 86_400_000).toISOString().slice(0, 10);
  const out: MoveRow[] = [];
  for (const l of leases) {
    if (!l || typeof l !== "object") continue;
    const r = l as Rec;
    const base = {
      tenant: tenantName(r.Tenant),
      property: nameOf(r.Property, "Name", "ShortName"),
      unit: nameOf(r.Unit, "Name"),
      leaseId: str(r.LeaseID),
    };
    const moveIn = day(r.MoveInDate) || day(r.ArrivalDate);
    const moveOut = day(r.MoveOutDate) || day(r.DepartureDate) || day(r.ExpectedMoveOutDate);
    if (moveIn && moveIn >= lo && moveIn <= hi) out.push({ type: "Move-in", date: moveIn, ...base });
    if (moveOut && moveOut >= lo && moveOut <= hi) out.push({ type: "Move-out", date: moveOut, ...base });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}

function easternNow(now: Date): { iso: string; hour: number } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { iso: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) };
}

export function moveDatesEnabled(): boolean {
  return process.env.MOVEDATES_DISABLED !== "true"
    && Boolean(process.env.RM_USERNAME && process.env.RM_PASSWORD)
    && Boolean(process.env.TRACKER_WEBHOOK_URL && process.env.TRACKER_WEBHOOK_TOKEN);
}

let lastRunDay = "";
let loggedShape = false;

async function readLeases(): Promise<unknown[]> {
  const paths = ["/Leases?embeds=Tenant,Unit,Property&pagesize=1000", "/Leases?embeds=Tenant,Unit&pagesize=1000", "/Leases?pagesize=1000"];
  for (const p of paths) {
    const r = await rm(p);
    if (r.status < 300 && Array.isArray(r.data)) {
      if (!loggedShape) {
        const f = (r.data as Rec[])[0];
        console.info(`[movedates] ${p} -> ${r.status}, ${r.data.length} leases; fields`, f ? Object.keys(f).join(",") : "none");
        loggedShape = true;
      }
      return r.data;
    }
    console.error(`[movedates] ${p} -> ${r.status}`, r.text.slice(0, 160).replace(/\s+/g, " "));
  }
  return [];
}

/** Called from the 5-minute tick. Runs at most once per Eastern day, after 6 AM. */
export async function runMoveDatesTick(now = new Date()): Promise<{ ran: boolean; rows?: number }> {
  if (!moveDatesEnabled()) return { ran: false };
  const et = easternNow(now);
  if (et.hour < RUN_HOUR_ET || lastRunDay === et.iso) return { ran: false };
  lastRunDay = et.iso; // one try a day, even on failure, so errors don't repeat every 5 minutes
  try {
    const rows = moveRowsFromLeases(await readLeases(), et.iso);
    const res = await fetch(process.env.TRACKER_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: process.env.TRACKER_WEBHOOK_TOKEN, kind: "move_dates", readAt: now.toISOString(), rows }),
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const out = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || (out && out.ok === false)) console.error("[movedates] tracker write failed", res.status, out?.error ?? "");
    else console.info("[movedates] wrote", rows.length, "rows");
    return { ran: true, rows: rows.length };
  } catch (err) {
    console.error("[movedates] error", (err as Error).message);
    return { ran: true };
  }
}

/** Test hook. */
export function _resetMoveDates() { lastRunDay = ""; loggedShape = false; }
