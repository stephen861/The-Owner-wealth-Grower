// Section 8 voucher pre-screen (owner's rule, Nov 25 2026): runs before Ava sends
// the application link, for every lead source.
//
// The check is fixed code, not the model. It looks only at voucher facts the
// prospect gives (bedroom size and expiration) against the home they picked.
// It never looks at income, credit, background, household size or who they are.
// When something doesn't fit, the link is held and Stephen decides; Ava never
// says anyone is denied. Household size is recorded for Stephen only.

export type PrescreenInput = {
  hasVoucher?: boolean | null;
  voucherAgency?: string | null;
  voucherBedrooms?: number | null;
  voucherExpires?: Date | null;
  householdSize?: number | null;
};

export type HomeFacts = { name: string; bedrooms: number[]; availableDate?: Date | null };

export type PrescreenResult = {
  outcome: "ASK" | "SEND_LINK" | "HOLD";
  missing: string[];
  /** Plain reasons the link is held (shown to the prospect kindly, and to Stephen). */
  holdReasons: string[];
  /** Notes for Stephen that don't hold the link. */
  flags: string[];
  /** One line logged to Rent Manager and the staff queue. */
  summary: string;
};

const DAY = 24 * 3600 * 1000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function evaluatePrescreen(p: PrescreenInput, home: HomeFacts, now = new Date()): PrescreenResult {
  const missing: string[] = [];
  if (p.hasVoucher == null) missing.push("whether they will use a housing voucher");
  if (p.hasVoucher) {
    if (!p.voucherAgency) missing.push("which housing agency issued the voucher (for example CMHA)");
    if (p.voucherBedrooms == null) missing.push("the bedroom size on the voucher");
    if (!p.voucherExpires) missing.push("the voucher's expiration date");
  }
  if (p.householdSize == null) missing.push("how many people will live in the home");

  const holdReasons: string[] = [];
  const flags: string[] = [];
  if (!missing.length && p.hasVoucher) {
    const exp = p.voucherExpires!;
    const smallest = home.bedrooms.length ? Math.min(...home.bedrooms) : null;
    if (exp.getTime() < now.getTime() - DAY) holdReasons.push(`the voucher expired on ${ymd(exp)}`);
    else if (home.availableDate && exp.getTime() < home.availableDate.getTime())
      holdReasons.push(`the voucher expires ${ymd(exp)}, before ${home.name} is available on ${ymd(home.availableDate)}`);
    else if (exp.getTime() - now.getTime() < 30 * DAY) flags.push(`voucher expires in under 30 days (${ymd(exp)})`);
    if (smallest != null && p.voucherBedrooms! < smallest)
      holdReasons.push(`the voucher is for ${p.voucherBedrooms} bedroom${p.voucherBedrooms === 1 ? "" : "s"} and ${home.name} has ${smallest}`);
  }

  const outcome = missing.length ? "ASK" : holdReasons.length ? "HOLD" : "SEND_LINK";
  const parts = [
    `Pre-screen for ${home.name}:`,
    p.hasVoucher == null ? "voucher ?" : p.hasVoucher ? `voucher yes (${p.voucherAgency ?? "agency ?"}, ${p.voucherBedrooms ?? "?"} BR, expires ${p.voucherExpires ? ymd(p.voucherExpires) : "?"})` : "no voucher",
    `household ${p.householdSize ?? "?"}`,
    outcome === "SEND_LINK" ? "-> application link sent" : outcome === "HOLD" ? `-> HELD for Stephen: ${holdReasons.join("; ")}` : "-> still asking",
    flags.length ? `| Flag for Stephen: ${flags.join("; ")}` : "",
  ];
  return { outcome, missing, holdReasons, flags, summary: parts.filter(Boolean).join(" ") };
}
