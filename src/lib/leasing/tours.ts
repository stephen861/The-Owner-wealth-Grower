// Tour confirmation loop.
//
// 1. The agent takes a tour request (request_tour tool).
// 2. The confirmer (TOUR_CONFIRMER_PHONE, e.g. George) gets a text with a
//    short code: "Reply YES 4821 to confirm or NO 4821 to decline."
// 3. Their reply confirms or declines the tour and texts the prospect.
// 4. The morning of a confirmed tour, the prospect gets a reminder.
// 5. An hour after the tour, the confirmer is asked how it went and replies
//    SHOWED 4821 or NOSHOW 4821, which is logged on the tour.
//
// TOUR_BOOKING_MODE="auto" skips step 2-3: an open slot (tour hours, no clash)
// is booked at once and the confirmer just gets a heads-up they can cancel.
//
// Every text goes through sendSms, so until LEASING_LIVE="true" only the
// numbers in LEASING_TEST_NUMBERS can receive anything.
import { prisma } from "@/lib/prisma";
import { sendSms, twilioRestConfigured } from "./twilio";
import { formatInZone } from "./time";

export type TourStatus = "REQUESTED" | "SCHEDULED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
export const TOUR_STATUSES: readonly TourStatus[] = ["REQUESTED", "SCHEDULED", "COMPLETED", "NO_SHOW", "CANCELLED"];

const clean = (n: string) => n.replace(/[^\d+]/g, "");

export function confirmerPhone(): string | null {
  const p = clean(process.env.TOUR_CONFIRMER_PHONE ?? "");
  return p || null;
}

export function tourBookingMode(): "confirm" | "auto" {
  return process.env.TOUR_BOOKING_MODE === "auto" ? "auto" : "confirm";
}

export async function newTourCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const digits = i < 10 ? 4 : 6;
    const code = String(Math.floor(10 ** (digits - 1) + Math.random() * 9 * 10 ** (digits - 1)));
    if (!(await prisma.tour.findFirst({ where: { code } }))) return code;
  }
  throw new Error("could not allocate a tour code");
}

type TourWithRefs = NonNullable<Awaited<ReturnType<typeof loadTour>>>;
function loadTour(id: string) {
  return prisma.tour.findUnique({ where: { id }, include: { property: true, prospect: true } });
}

const when = (t: TourWithRefs) => formatInZone(t.scheduledAt, t.property.timezone, "medium");
const where = (t: TourWithRefs) => t.property.address || t.property.name;
const who = (t: TourWithRefs) => t.prospect.name || t.prospect.phone || "a web chat visitor";

/** Text the confirmer, if one is set. Returns whether a text actually went out. */
async function textConfirmer(body: string): Promise<boolean> {
  const to = confirmerPhone();
  if (!to || !twilioRestConfigured()) {
    console.info(`[tours] no confirmer text (confirmer ${to ? "set" : "unset"}): ${body.slice(0, 80)}`);
    return false;
  }
  return sendSms(to, body).catch((e) => {
    console.error("[tours confirmer send]", e);
    return false;
  });
}

/** Message the prospect on their own channel and keep it in their history. */
export async function messageProspect(prospectId: string, body: string): Promise<boolean> {
  const p = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!p) return false;
  let delivered = true;
  let channel = "WEB";
  if (p.phone) {
    channel = "SMS";
    delivered =
      !p.smsOptOut && twilioRestConfigured()
        ? await sendSms(p.phone, body).catch((e) => {
            console.error("[tours prospect send]", e);
            return false;
          })
        : false;
  }
  // AGENT author so the agent sees it in history and web chat shows it.
  await prisma.message.create({ data: { prospectId, direction: "OUT", author: "AGENT", channel, body, delivered } });
  return delivered;
}

/** Called right after the agent creates a tour. */
export async function notifyTourRequested(tourId: string): Promise<void> {
  const t = await loadTour(tourId);
  if (!t || !t.code) return;
  const body =
    t.status === "SCHEDULED"
      ? `FGW tour booked #${t.code}: ${who(t)} at ${t.property.name}, ${when(t)}. Reply NO ${t.code} to cancel it.`
      : `FGW tour request #${t.code}: ${who(t)} wants to see ${t.property.name}, ${when(t)}. Reply YES ${t.code} to confirm or NO ${t.code} to decline.`;
  if (await textConfirmer(body)) {
    await prisma.tour.update({ where: { id: t.id }, data: { confirmerNotifiedAt: new Date() } });
  }
}

/** Drop the "Tour request: ..." note for this tour from the staff queue. */
async function clearTourAsk(t: TourWithRefs) {
  const reason = t.prospect.escalationReason ?? "";
  const parts = reason.split(" | ").filter((s) => !(s.startsWith("Tour request:") && s.includes(t.property.name)));
  const rest = parts.join(" | ");
  await prisma.prospect.update({
    where: { id: t.prospectId },
    data: { escalationReason: rest || null, needsHuman: rest ? t.prospect.needsHuman : false },
  });
}

function sameLocalDay(a: Date, b: Date, tz: string) {
  const d = (x: Date) => x.toLocaleDateString("en-US", { timeZone: tz });
  return d(a) === d(b);
}

/**
 * Move a tour to a new status and tell the prospect when it changes for them.
 * Used by the confirmer's text replies and the staff inbox buttons.
 */
export async function applyTourStatus(tourId: string, status: TourStatus): Promise<{ ok: boolean; note: string }> {
  const t = await loadTour(tourId);
  if (!t) return { ok: false, note: "Tour not found." };
  const open = t.status === "REQUESTED" || t.status === "SCHEDULED";
  const now = new Date();

  if (status === "SCHEDULED") {
    if (t.status !== "REQUESTED") return { ok: false, note: `Tour #${t.code} is already ${t.status.toLowerCase()}.` };
    await prisma.tour.update({
      where: { id: t.id },
      // Confirmed on the tour day itself: the confirmation is the reminder.
      data: { status, confirmedAt: now, reminderSentAt: sameLocalDay(now, t.scheduledAt, t.property.timezone) ? now : undefined },
    });
    await clearTourAsk(t);
    await messageProspect(
      t.prospectId,
      `Good news: your tour of ${t.property.name} is confirmed for ${when(t)} at ${where(t)}. A member of the FGW team will meet you there. Reply here if you need to change it.`,
    );
    return { ok: true, note: `Confirmed #${t.code}: ${who(t)}, ${when(t)}. They've been told.` };
  }

  if (status === "CANCELLED") {
    if (!open) return { ok: false, note: `Tour #${t.code} is already ${t.status.toLowerCase()}.` };
    await prisma.tour.update({ where: { id: t.id }, data: { status } });
    await clearTourAsk(t);
    await messageProspect(
      t.prospectId,
      `Sorry, we can't make the ${when(t)} tour of ${t.property.name} work. Reply with another day and time that suits you and we'll find one.`,
    );
    return { ok: true, note: `Declined #${t.code}. ${who(t)} was asked for another time.` };
  }

  if (status === "COMPLETED" || status === "NO_SHOW") {
    if (t.status !== "SCHEDULED") return { ok: false, note: `Tour #${t.code} is ${t.status.toLowerCase()}, not confirmed.` };
    await prisma.tour.update({ where: { id: t.id }, data: { status } });
    return { ok: true, note: `Logged #${t.code} as ${status === "COMPLETED" ? "showed" : "no-show"}.` };
  }

  await prisma.tour.update({ where: { id: t.id }, data: { status } });
  return { ok: true, note: `Tour #${t.code} set to ${status.toLowerCase()}.` };
}

const CMD =
  /^\s*(yes|y|confirm|confirmed|ok|no|n|decline|cancel|showed|show|shown|came|noshow|no[\s-]show|ns)\b[\s#:]*(\d{4,6})?\s*[.!]?\s*$/i;

function commandStatus(word: string): TourStatus {
  const w = word.toLowerCase().replace(/[\s-]/g, "");
  if (["yes", "y", "confirm", "confirmed", "ok"].includes(w)) return "SCHEDULED";
  if (["no", "n", "decline", "cancel"].includes(w)) return "CANCELLED";
  if (["showed", "show", "shown", "came"].includes(w)) return "COMPLETED";
  return "NO_SHOW";
}

/**
 * Handle an inbound text from the confirmer's phone. Returns the reply to send
 * back, or null if the text isn't a tour command (so it goes to the agent).
 */
export async function handleConfirmerSms(from: string, body: string): Promise<string | null> {
  const me = confirmerPhone();
  if (!me || clean(from) !== me) return null;
  const m = CMD.exec(body);
  if (!m) return null;
  const status = commandStatus(m[1]);
  const code = m[2];

  let tour = code ? await prisma.tour.findFirst({ where: { code }, orderBy: { createdAt: "desc" } }) : null;
  if (code && !tour) return `No tour #${code} found. Check the code in the request text.`;
  if (!tour) {
    // No code: accept only when exactly one tour is waiting on this answer.
    const waiting = await prisma.tour.findMany({
      where:
        status === "SCHEDULED" || status === "CANCELLED"
          ? { status: "REQUESTED", confirmerNotifiedAt: { not: null } }
          : { status: "SCHEDULED", outcomeAskedAt: { not: null } },
      include: { property: true },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    });
    if (waiting.length === 0) return status === "SCHEDULED" || status === "CANCELLED" ? null : "No tour is waiting on an outcome.";
    if (waiting.length > 1) {
      const list = waiting.map((w) => `#${w.code} ${w.property.name} ${formatInZone(w.scheduledAt, w.property.timezone, "medium")}`).join("; ");
      return `More than one tour is waiting. Add the code, like "${m[1].toUpperCase()} ${waiting[0].code}". Open: ${list}`;
    }
    tour = waiting[0];
  }
  return (await applyTourStatus(tour.id, status)).note;
}

/**
 * Time-based steps. Safe to run often; each step is recorded so it fires once.
 * - Morning-of reminder (from 8:00 property time) to the prospect.
 * - Outcome question to the confirmer an hour after the tour.
 * - Re-sends a tour request text that failed to go out earlier.
 */
export async function runTourTick(now = new Date()): Promise<{ reminders: number; outcomeAsks: number; requests: number }> {
  let reminders = 0;
  let outcomeAsks = 0;
  let requests = 0;

  const dueReminders = await prisma.tour.findMany({
    where: { status: "SCHEDULED", reminderSentAt: null, scheduledAt: { gt: now, lt: new Date(now.getTime() + 24 * 3600e3) } },
    include: { property: true, prospect: true },
  });
  for (const t of dueReminders) {
    const tz = t.property.timezone;
    const localHour = Number(now.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }));
    if (!sameLocalDay(now, t.scheduledAt, tz) || localHour < 8) continue;
    await prisma.tour.update({ where: { id: t.id }, data: { reminderSentAt: now } });
    await messageProspect(
      t.prospectId,
      `Reminder: your tour of ${t.property.name} is today, ${formatInZone(t.scheduledAt, tz, "medium")}, at ${t.property.address || t.property.name}. Reply here if you're running late or need to change it.`,
    );
    reminders++;
  }

  if (confirmerPhone()) {
    const dueOutcome = await prisma.tour.findMany({
      where: { status: "SCHEDULED", outcomeAskedAt: null, scheduledAt: { lt: new Date(now.getTime() - 3600e3) } },
      include: { property: true, prospect: true },
    });
    for (const t of dueOutcome) {
      const sent = await textConfirmer(
        `How did tour #${t.code} go (${t.prospect.name || t.prospect.phone || "web visitor"}, ${t.property.name}, ${formatInZone(t.scheduledAt, t.property.timezone, "medium")})? Reply SHOWED ${t.code} or NOSHOW ${t.code}.`,
      );
      if (sent) {
        await prisma.tour.update({ where: { id: t.id }, data: { outcomeAskedAt: now } });
        outcomeAsks++;
      }
    }

    const unsent = await prisma.tour.findMany({
      where: { status: { in: ["REQUESTED", "SCHEDULED"] }, confirmerNotifiedAt: null, code: { not: null }, scheduledAt: { gt: now } },
      select: { id: true },
    });
    for (const t of unsent) {
      await notifyTourRequested(t.id);
      requests++;
    }
  }

  return { reminders, outcomeAsks, requests };
}
