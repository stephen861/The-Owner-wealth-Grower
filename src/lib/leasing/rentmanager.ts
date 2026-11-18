/**
 * Write texting prospects into Rent Manager 12 (Web API) as Prospects.
 *
 * Login: the "Martin AI" Rent Manager user. Its user name and password live
 * only in Render (RM_USERNAME / RM_PASSWORD) and are never logged.
 *
 * Off unless RM_USERNAME and RM_PASSWORD are set.
 * RM_SYNC_MODE: "live" (default; the owner said yes on Nov 18, 2026) writes every texting prospect;
 *               "test" writes only numbers in LEASING_TEST_NUMBERS; "off" writes nothing.
 * Never blocks or breaks a reply: failures are logged and dropped.
 * No income, household, voucher or credit details are sent (no-screening rule).
 */
import { prisma } from "@/lib/prisma";
import { testNumbers } from "./twilio";

const BASE = (process.env.RM_BASE_URL || "https://fgwi.api.rentmanager.com").replace(/\/+$/, "");
const LEAD_SOURCE_NAME = process.env.RM_LEAD_SOURCE || "AI Text Agent";

export function rmEnabled(): boolean {
  return Boolean(process.env.RM_USERNAME && process.env.RM_PASSWORD) && rmMode() !== "off";
}

function rmMode(): "test" | "live" | "off" {
  const m = (process.env.RM_SYNC_MODE || "live").toLowerCase();
  return m === "test" ? "test" : m === "off" ? "off" : "live";
}

let token: string | null = null;

async function authorize(): Promise<string> {
  const body: Record<string, unknown> = {
    Username: process.env.RM_USERNAME,
    Password: process.env.RM_PASSWORD,
  };
  if (process.env.RM_LOCATION_ID) body.LocationID = Number(process.env.RM_LOCATION_ID);
  const res = await fetch(`${BASE}/Authentication/AuthorizeUser`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`authorize failed ${res.status}: ${text.slice(0, 300)}`);
  let t: unknown = text;
  try { t = JSON.parse(text); } catch { /* plain string */ }
  if (typeof t !== "string" || !t) throw new Error("authorize returned no token");
  token = t;
  return t;
}

/** Call the Rent Manager API with the cached token; re-authorizes once on 401. */
export async function rm(path: string, init: RequestInit = {}): Promise<{ status: number; data: unknown; text: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const tok = token ?? (await authorize());
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-RM12Api-ApiToken": tok, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    if (res.status === 401 && attempt === 0) { token = null; continue; }
    let data: unknown = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, data, text };
  }
  throw new Error("unreachable");
}

function splitName(name: string | null, phone: string | null): { FirstName: string; LastName: string } {
  const clean = (name ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return { FirstName: "Text lead", LastName: (phone ?? "").replace(/\D/g, "").slice(-4) || "Unknown" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { FirstName: parts[0], LastName: "(no last name)" };
  return { FirstName: parts.slice(0, -1).join(" "), LastName: parts[parts.length - 1] };
}

let leadSourceId: number | null | undefined;
async function findLeadSourceId(): Promise<number | null> {
  if (leadSourceId !== undefined) return leadSourceId;
  const r = await rm(`/LeadSources`);
  const list = Array.isArray(r.data) ? (r.data as { ProspectLeadSourceID?: number; Description?: string }[]) : [];
  const hit = list.find((s) => (s.Description ?? "").trim().toLowerCase() === LEAD_SOURCE_NAME.toLowerCase());
  leadSourceId = hit?.ProspectLeadSourceID ?? null;
  return leadSourceId;
}

let cellTypeId: number | null | undefined;
async function findCellPhoneTypeId(): Promise<number | null> {
  if (cellTypeId !== undefined) return cellTypeId;
  const r = await rm(`/PhoneNumberTypes`);
  const list = Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [];
  const hit = list.find((t) => /cell|mobile/i.test(String(t.Name ?? t.Description ?? "")));
  cellTypeId = (hit?.PhoneNumberTypeID as number | undefined) ?? null;
  return cellTypeId;
}

let properties: { PropertyID: number; Name: string }[] | undefined;
async function loadProperties(): Promise<{ PropertyID: number; Name: string }[]> {
  if (!properties) {
    const r = await rm(`/Properties?fields=PropertyID,Name`);
    properties = Array.isArray(r.data) ? (r.data as { PropertyID: number; Name: string }[]) : [];
  }
  return properties;
}
/** Rent Manager needs a property on every prospect; leads with no listing chosen go under "FGW Investments". */
async function findDefaultPropertyId(): Promise<number | null> {
  if (process.env.RM_DEFAULT_PROPERTY_ID) return Number(process.env.RM_DEFAULT_PROPERTY_ID);
  const hit = (await loadProperties()).find((p) => /fgw investments/i.test(p.Name));
  return hit?.PropertyID ?? null;
}
/** Match our listing (e.g. "604 Racine") to a Rent Manager property by street number and first street word. */
async function findPropertyId(name: string | null | undefined): Promise<number | null> {
  if (!name) return null;
  const list = await loadProperties();
  const m = name.match(/^(\d+)\s+(?:[NSEW]\.?\s+)?(\w+)/i);
  if (!m) return null;
  const [, num, street] = m;
  const hit = list.find((p) => new RegExp(`(^|\\D)${num}(\\D|$)`).test(p.Name) && p.Name.toLowerCase().includes(street.toLowerCase()));
  return hit?.PropertyID ?? null;
}

function shouldWrite(phone: string | null): boolean {
  if (!rmEnabled()) return false;
  if (rmMode() === "live") return true;
  const clean = (phone ?? "").replace(/[^\d+]/g, "");
  return Boolean(clean) && testNumbers().includes(clean);
}

/** Fire-and-forget: create this prospect in Rent Manager once (every texting lead unless RM_SYNC_MODE=test or off). */
const inFlight = new Set<string>();
export function syncProspectToRentManager(prospectId: string): void {
  if (inFlight.has(prospectId)) return; // a write for this prospect is already running
  inFlight.add(prospectId);
  void (async () => {
    try {
      const p = await prisma.prospect.findUnique({ where: { id: prospectId }, include: { property: true } });
      if (!p || !shouldWrite(p.phone)) return;
      if (p.rmProspectId) {
        // Already in Rent Manager: only update the name once the prospect gives it.
        if (p.name && p.name !== p.rmSyncedName) {
          const names = splitName(p.name, p.phone);
          const u = await rm(`/Prospects`, { method: "POST", body: JSON.stringify([{ ProspectID: p.rmProspectId, ...names }]) });
          if (u.status < 300) await prisma.prospect.update({ where: { id: prospectId }, data: { rmSyncedName: p.name } });
          else console.error("[rentmanager] name update failed", u.status, u.text.slice(0, 300));
        }
        return;
      }
      const ls = await findLeadSourceId().catch(() => null);
      const comment = [
        `Texting leasing agent lead (${p.source ?? "SMS"}).`,
        p.property?.name ? `Interested in: ${p.property.name}.` : "",
        p.bedroomsWanted ? `Bedrooms: ${p.bedroomsWanted}.` : "",
        p.moveInDate ? `Move-in: ${p.moveInDate.toISOString().slice(0, 10)}.` : "",
      ].filter(Boolean).join(" ");
      const names = splitName(p.name, p.phone);
      const [cell, propertyId] = await Promise.all([
        findCellPhoneTypeId().catch(() => null),
        findPropertyId(p.property?.name).then((id) => id ?? findDefaultPropertyId()).catch(() => null),
      ]);
      const phone: Record<string, unknown> = { PhoneNumber: (p.phone ?? "").replace(/^\+1/, "").replace(/\D/g, ""), IsPrimary: true };
      if (cell) phone.PhoneNumberTypeID = cell;
      const contact: Record<string, unknown> = { ...names, IsPrimary: true, PhoneNumbers: p.phone ? [phone] : [] };
      if (p.email) contact.Email = p.email;
      const prospect: Record<string, unknown> = { ...names, Comment: comment, PrimaryContact: contact };
      if (ls) prospect.LeadSourceID = ls;
      if (propertyId) prospect.PropertyID = propertyId;
      const r = await rm(`/Prospects`, { method: "POST", body: JSON.stringify([prospect]) });
      if (r.status >= 300) {
        console.error("[rentmanager] create prospect failed", r.status, r.text.slice(0, 500));
        return;
      }
      const created = Array.isArray(r.data) ? (r.data[0] as { ProspectID?: number }) : (r.data as { ProspectID?: number });
      const id = created?.ProspectID;
      if (id) await prisma.prospect.update({ where: { id: prospectId }, data: { rmProspectId: id, rmSyncedName: p.name ?? null } });
      console.info("[rentmanager] prospect created", { rmProspectId: id ?? null, leadSource: ls ? LEAD_SOURCE_NAME : "none" });
    } catch (err) {
      console.error("[rentmanager] sync error", (err as Error).message);
    } finally {
      inFlight.delete(prospectId);
    }
  })();
}

/** Startup check: log in, then log the shape (field names only, no personal data) of Rent Manager's records. */
export async function rmProbe(): Promise<void> {
  if (!process.env.RM_USERNAME || !process.env.RM_PASSWORD) return;
  const keys = (v: unknown) => (v && typeof v === "object" ? Object.keys(v as object).join(",") : String(v));
  const firstOf = (d: unknown) => (Array.isArray(d) ? d[0] : d);
  try {
    await authorize();
    console.info("[rentmanager probe] login ok", { base: BASE, mode: rmMode() });
    for (const path of [
      "/Prospects?pagesize=1",
      "/Prospects?pagesize=1&embeds=Contacts",
      "/Prospects?pagesize=1&embeds=Contacts.PhoneNumbers",
      "/LeadSources?pagesize=1",
    ]) {
      const r = await rm(path);
      const f = firstOf(r.data) as Record<string, unknown> | undefined;
      console.info(`[rentmanager probe] ${path} -> ${r.status}`, r.status < 300 ? keys(f) : r.text.slice(0, 160).replace(/\s+/g, " "));
      const c = f && Array.isArray(f.Contacts) ? (f.Contacts as Record<string, unknown>[])[0] : undefined;
      if (c) {
        console.info("[rentmanager probe]   contact fields", keys(c));
        if (Array.isArray(c.PhoneNumbers) && c.PhoneNumbers[0]) console.info("[rentmanager probe]   phone fields", keys(c.PhoneNumbers[0]));
      }
    }
    console.info("[rentmanager probe] lookups", {
      leadSource: await findLeadSourceId().catch((e) => `err ${(e as Error).message}`),
      cellType: await findCellPhoneTypeId().catch((e) => `err ${(e as Error).message}`),
      racine: await findPropertyId("604 Racine").catch((e) => `err ${(e as Error).message}`),
      richardson: await findPropertyId("48 S Richardson").catch((e) => `err ${(e as Error).message}`),
      fallback: await findDefaultPropertyId().catch((e) => `err ${(e as Error).message}`),
    });
    await backfillTestProspects();
  } catch (err) {
    console.error("[rentmanager probe] failed", (err as Error).message);
  }
}

/** Test mode only: write up to 3 existing test-number prospects that are not in Rent Manager yet. */
async function backfillTestProspects(): Promise<void> {
  if (rmMode() !== "test") return;
  const nums = testNumbers();
  if (!nums.length) { console.info("[rentmanager] no test numbers set; nothing to backfill"); return; }
  const rows = await prisma.prospect.findMany({
    where: { phone: { in: nums }, rmProspectId: null },
    orderBy: { updatedAt: "desc" },
    take: 3,
    select: { id: true },
  });
  console.info("[rentmanager] test prospects to write", rows.length);
  for (const r of rows) syncProspectToRentManager(r.id);
}
