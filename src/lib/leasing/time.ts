// Timezone helpers: tour requests are in the PROPERTY's local time, no matter
// what timezone the server runs in.

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Offset (ms) of `tz` from UTC at instant `utcMs`.
function offsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

export type LocalWallTime = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

// Parse "YYYY-MM-DDTHH:MM" (seconds / zone suffix ignored) as wall-clock time.
export function parseWallTime(s: string): LocalWallTime | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, weekday };
}

// Convert a wall-clock time in `tz` to a real instant.
export function zonedToUtc(w: LocalWallTime, tz: string): Date {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  let utc = guess - offsetMs(guess, tz);
  utc = guess - offsetMs(utc, tz); // second pass handles DST boundaries
  return new Date(utc);
}

// dateStyle/timeStyle cannot be combined with timeZoneName, so the zone label is formatted separately.
export function zoneAbbr(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? tz;
}

export function formatInZone(d: Date, tz: string, dateStyle: "full" | "medium" = "full"): string {
  return `${d.toLocaleString("en-US", { timeZone: tz, dateStyle, timeStyle: "short" })} ${zoneAbbr(d, tz)}`;
}
