// Runs once when the Next.js server starts. Drives the time-based steps of the
// tour loop (morning-of reminders, "how did it go?" texts) every 5 minutes,
// inside the web service itself, so no separate (paid) cron job is needed.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  void import("@/lib/leasing/rentmanager").then((m) => m.rmProbe()); // log in to Rent Manager once and log what it sees
  if (process.env.TOUR_TICK_DISABLED === "true") return;
  const { runTourTick } = await import("@/lib/leasing/tours");
  const { runFollowUpTick } = await import("@/lib/leasing/followups");
  const tick = async () => {
    try {
      const r = await runTourTick();
      if (r.reminders || r.outcomeAsks || r.requests) console.info("[tours tick]", r);
      const f = await runFollowUpTick();
      if (f.nudges) console.info("[follow-up tick]", f);
    } catch (e) {
      console.error("[tours tick]", e);
    }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000).unref?.();
}
