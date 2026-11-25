// Prospect follow-up: short nudges to leads who texted us first and then went quiet.
// Runs from the same 5-minute timer as the tour loop. Every text goes through
// messageProspect -> sendSms, so the go-live switch, the test list and STOP all apply.
import { prisma } from "@/lib/prisma";
import { messageProspect } from "./tours";

const TZ = "America/New_York";
const DAY = 24 * 3600e3;
// Nudge n is due this long after their last text.
const SCHEDULE = [1 * DAY, 3 * DAY, 7 * DAY];
// Stop once a lead has moved past "talking".
const DONE_STATUSES = ["TOUR_SCHEDULED", "APPLYING", "WAITLIST", "LEASED", "NOT_ELIGIBLE", "CLOSED"];

export function followUpsEnabled(): boolean {
  return process.env.FOLLOWUPS_ENABLED !== "false";
}

function localHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", hour: "2-digit" }).format(d));
}

/** 9am to 8pm Columbus time. */
export function inSendWindow(now: Date): boolean {
  const h = localHour(now);
  return h >= 9 && h < 20;
}

function firstName(name: string | null): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n && !/^test$/i.test(n) ? ` ${n}` : "";
}

/** Names a list like "A or B". */
function orList(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
}

/** Nudge for a lead whose home has been rented: say so and point to open homes nearby. */
export function rentedNudgeText(n: number, name: string | null, home: string, others: string[]): string {
  const open = others.length ? `${orList(others)} ${others.length > 1 ? "are" : "is"} open` : "we have other homes open";
  if (n === 0) return `Hi${firstName(name)}, it's FGW. ${home} has been rented, but ${open}. Want the application link?`;
  if (n === 1) return `Quick check-in from FGW: ${home} is rented, but ${open}. Reply for the application link. Tours come after approval.`;
  return `Last note from FGW: ${home} is rented, but ${open}. Reply anytime for the application link.`;
}

export function nudgeText(n: number, name: string | null, home: string | null): string {
  const h = home ?? "one of our homes";
  if (n === 0) return `Hi${firstName(name)}, it's FGW. Still interested in ${h}? I can send the application link. Tours are set up once it's approved.`;
  if (n === 1) return `Quick check-in from FGW: ${h} is still available. Want the application link? Tours come after approval.`;
  return `Last note from FGW about ${h}. Reply anytime if you'd like the application link.`;
}

export async function runFollowUpTick(now = new Date()): Promise<{ nudges: number }> {
  if (!followUpsEnabled() || !inSendWindow(now)) return { nudges: 0 };
  const candidates = await prisma.prospect.findMany({
    where: {
      phone: { not: null },
      smsOptOut: false,
      aiEnabled: true,
      status: { notIn: DONE_STATUSES },
      followUpCount: { lt: SCHEDULE.length },
      // Consent: only people who texted the leasing number first.
      messages: { some: { direction: "IN", channel: "SMS" } },
    },
    include: {
      property: { include: { units: { where: { status: "AVAILABLE" }, select: { id: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      tours: { where: { status: { in: ["REQUESTED", "SCHEDULED"] } }, take: 1 },
    },
    take: 200,
  });

  let nudges = 0;
  for (const p of candidates) {
    if (p.tours.length) continue; // a tour is in motion
    const last = p.messages[0];
    if (!last || last.direction !== "OUT") continue; // waiting on us, not them
    if (!last.delivered) continue; // our last text never reached them (held before go-live)
    const lastIn = await prisma.message.findFirst({
      where: { prospectId: p.id, direction: "IN" },
      orderBy: { createdAt: "desc" },
    });
    if (!lastIn) continue;
    // They texted since our last nudge: start the count over.
    let count = p.followUpCount;
    if (p.lastFollowUpAt && lastIn.createdAt > p.lastFollowUpAt) count = 0;
    if (count >= SCHEDULE.length) continue;
    if (now.getTime() - lastIn.createdAt.getTime() < SCHEDULE[count]) continue;
    // Claim the slot first so a slow send can't double-text.
    const claimed = await prisma.prospect.updateMany({
      where: { id: p.id, followUpCount: p.followUpCount, lastFollowUpAt: p.lastFollowUpAt },
      data: { followUpCount: count + 1, lastFollowUpAt: now },
    });
    if (!claimed.count) continue;
    const prop = p.property;
    if (prop && prop.units.length === 0) {
      // Their home was rented: never ask if they still want it. Offer open homes in the same state.
      const open = await prisma.property.findMany({
        where: { active: true, state: prop.state, id: { not: prop.id }, units: { some: { status: "AVAILABLE" } } },
        select: { name: true },
        orderBy: { name: "asc" },
        take: 3,
      });
      await messageProspect(p.id, rentedNudgeText(count, p.name, prop.name, open.map((o) => o.name)));
    } else {
      await messageProspect(p.id, nudgeText(count, p.name, prop?.name ?? null));
    }
    nudges++;
  }
  return { nudges };
}

/** Sent when the confirmer marks a tour as showed. */
export function showedText(home: string, appUrl: string | null): string {
  return appUrl
    ? `Thanks for touring ${home} today. Here's the application link: ${appUrl} Questions? Just reply.`
    : `Thanks for touring ${home} today. Want the application link? Just reply.`;
}

/** Sent when the confirmer marks a tour as a no-show. */
export function noShowText(home: string): string {
  return `Sorry we missed you at ${home}. Want to pick another time to see it?`;
}
