/**
 * Write texting prospects into Rent Manager 12 (Web API) as Prospects.
 *
 * Login: the "Martin AI" Rent Manager user. Its user name and password live
 * only in Render (RM_USERNAME / RM_PASSWORD) and are never logged.
 *
 * Off unless RM_USERNAME and RM_PASSWORD are set.
 * RM_SYNC_MODE: "test" (default) writes only numbers in LEASING_TEST_NUMBERS;
 *               "live" writes every texting prospect; "off" writes nothing.
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
  const m = (process.env.RM_SYNC_MODE || "test").toLowerCase();
  return m === "live" ? "live" : m === "off" ? "off" : "test";
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
  const r = await rm(`/LeadSources?fields=LeadSourceID,Name`);
  const list = Array.isArray(r.data) ? (r.data as { LeadSourceID?: number; Name?: string }[]) : [];
  const hit = list.find((s) => (s.Name ?? "").toLowerCase() === LEAD_SOURCE_NAME.toLowerCase());
  leadSourceId = hit?.LeadSourceID ?? null;
  return leadSourceId;
}

function shouldWrite(phone: string | null): boolean {
  if (!rmEnabled()) return false;
  if (rmMode() === "live") return true;
  const clean = (phone ?? "").replace(/[^\d+]/g, "");
  return Boolean(clean) && testNumbers().includes(clean);
}

/** Fire-and-forget: create this prospect in Rent Manager once (test numbers only unless RM_SYNC_MODE=live). */
export function syncProspectToRentManager(prospectId: string): void {
  void (async () => {
    try {
      const p = await prisma.prospect.findUnique({ where: { id: prospectId }, include: { property: true } });
      if (!p || !shouldWrite(p.phone)) return;
      if (p.rmProspectId) return; // already in Rent Manager
      const ls = await findLeadSourceId().catch(() => null);
      const comment = [
        `Texting leasing agent lead (${p.source ?? "SMS"}).`,
        p.property?.name ? `Interested in: ${p.property.name}.` : "",
        p.bedroomsWanted ? `Bedrooms: ${p.bedroomsWanted}.` : "",
        p.moveInDate ? `Move-in: ${p.moveInDate.toISOString().slice(0, 10)}.` : "",
      ].filter(Boolean).join(" ");
      const prospect: Record<string, unknown> = {
        ...splitName(p.name, p.phone),
        Comment: comment,
        PhoneNumbers: p.phone ? [{ PhoneNumber: p.phone.replace(/^\+1/, ""), IsPrimary: true }] : [],
      };
      if (p.email) prospect.Email = p.email;
      if (ls) prospect.LeadSourceID = ls;
      const r = await rm(`/Prospects`, { method: "POST", body: JSON.stringify([prospect]) });
      if (r.status >= 300) {
        console.error("[rentmanager] create prospect failed", r.status, r.text.slice(0, 500));
        return;
      }
      const created = Array.isArray(r.data) ? (r.data[0] as { ProspectID?: number }) : (r.data as { ProspectID?: number });
      const id = created?.ProspectID;
      if (id) await prisma.prospect.update({ where: { id: prospectId }, data: { rmProspectId: id } });
      console.info("[rentmanager] prospect created", { rmProspectId: id ?? null, leadSource: ls ? LEAD_SOURCE_NAME : "none" });
    } catch (err) {
      console.error("[rentmanager] sync error", (err as Error).message);
    }
  })();
}

/** Startup check: log in, then log the shape (field names only, no personal data) of Rent Manager's Prospect record. */
export async function rmProbe(): Promise<void> {
  if (!process.env.RM_USERNAME || !process.env.RM_PASSWORD) return;
  try {
    await authorize();
    console.info("[rentmanager probe] login ok", { base: BASE, mode: rmMode() });
    const pr = await rm(`/Prospects?pagesize=1&embeds=PhoneNumbers`);
    const first = Array.isArray(pr.data) ? (pr.data[0] as Record<string, unknown> | undefined) : undefined;
    console.info("[rentmanager probe] prospects", pr.status, first ? Object.keys(first).join(",") : pr.text.slice(0, 300));
    const phones = first?.PhoneNumbers;
    if (Array.isArray(phones) && phones[0]) console.info("[rentmanager probe] phone fields", Object.keys(phones[0] as object).join(","));
    const ls = await rm(`/LeadSources?fields=LeadSourceID,Name`);
    const names = Array.isArray(ls.data) ? (ls.data as { Name?: string }[]).map((s) => s.Name).join(" | ") : ls.text.slice(0, 300);
    console.info("[rentmanager probe] lead sources", ls.status, names);
  } catch (err) {
    console.error("[rentmanager probe] failed", (err as Error).message);
  }
}
