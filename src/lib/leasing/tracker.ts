/**
 * Mirror each texting prospect into the FGW Leasing Tracker (Google Sheet),
 * one row per prospect, updated in place. The sheet side is the doPost() in
 * integrations/affordablehousing/ah-instant-reply.gs, deployed as a web app in
 * the fgwleasing@gmail.com account.
 *
 * Off unless both TRACKER_WEBHOOK_URL and TRACKER_WEBHOOK_TOKEN are set.
 * Never blocks or breaks a reply: failures are logged and dropped.
 * No income, household or credit details are sent (no-screening rule).
 */
import { prisma } from "@/lib/prisma";

export function trackerEnabled(): boolean {
  return Boolean(process.env.TRACKER_WEBHOOK_URL && process.env.TRACKER_WEBHOOK_TOKEN);
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");
const clip = (s: string | null | undefined, n = 300) => (s ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

export async function trackerRow(prospectId: string) {
  const p = await prisma.prospect.findUnique({
    where: { id: prospectId },
    include: {
      property: true,
      tours: { orderBy: { scheduledAt: "desc" }, take: 1, include: { property: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!p) return null;
  const tour = p.tours[0];
  const lastIn = p.messages.find((m) => m.direction === "IN");
  const lastOut = p.messages.find((m) => m.direction === "OUT");
  const tz = tour?.property.timezone ?? "America/New_York";
  return {
    id: p.id,
    firstContact: iso(p.createdAt),
    lastActivity: iso(p.lastMessageAt ?? p.updatedAt),
    source: p.source ?? "",
    name: p.name ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    home: tour?.property.name ?? p.property?.name ?? "",
    bedrooms: p.bedroomsWanted ?? "",
    moveIn: p.moveInDate ? p.moveInDate.toISOString().slice(0, 10) : "",
    status: p.status,
    tour: tour ? tour.scheduledAt.toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : "",
    tourStatus: tour?.status ?? "",
    needsStaff: p.needsHuman,
    why: clip(p.escalationReason, 200),
    lastIn: clip(lastIn?.body),
    lastOut: clip(lastOut?.body),
    optedOut: p.smsOptOut,
  };
}

/** Fire-and-forget: push this prospect's current row to the tracker. */
export function syncProspectToTracker(prospectId: string): void {
  if (!trackerEnabled()) return;
  void (async () => {
    try {
      const lead = await trackerRow(prospectId);
      if (!lead) return;
      const res = await fetch(process.env.TRACKER_WEBHOOK_URL!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: process.env.TRACKER_WEBHOOK_TOKEN, kind: "agent_lead", lead }),
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) console.error("[tracker] sync failed", res.status);
      else {
        const out = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (out && out.ok === false) console.error("[tracker] sync rejected", out.error);
      }
    } catch (err) {
      console.error("[tracker] sync error", (err as Error).message);
    }
  })();
}
